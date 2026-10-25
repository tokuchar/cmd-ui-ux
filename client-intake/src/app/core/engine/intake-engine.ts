import { computed, inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, shareReplay, switchMap, tap, toArray } from 'rxjs';
import { CLIENT_API } from '../api/client-api';
import { APP_CONFIG } from '../config/app-config';
import { CommandDef } from '../config/commands.config';
import { DictionaryService } from '../services/dictionary.service';
import { ToastService } from '../services/toast.service';
import { Candidate, CollectionState, Cursor, EchoType, IntakeStore } from '../state/intake.store';
import { DictEntry, FieldDef, FieldIssue } from './field-def';
import {
  applyComputed,
  applyField,
  evaluateField,
  fieldDisplay,
  fieldHint,
  fieldInput,
  fieldOptions,
  fieldPrefill,
  isAsked,
  isFieldComplete,
} from './field-runtime';
import { askedPositions, findCollectionStep, findField, FlowPosition, optionalGroups, stepNumber } from './flow';
import { getPath, parseItemPath, setPath } from './path';
import { Customer } from '../models/customer.model';
import { CollectionDef, CollectionItem, EffectResult, HookContext } from './step-def';
import { escapeHtml, normalize, plural } from './text';

/** Co pokazuje command line (wyliczane z kursora i stanu). */
export interface Prompt {
  label: string;
  counter: string;
  placeholder: string;
  primary: string;
  showBack: boolean;
  showApprove: boolean;
  disabled: boolean;
  /** Pole, którego dotyczy wpis (ghost-text, opcje). */
  field: FieldDef | null;
  options: DictEntry[];
  allowCustom: boolean;
}

export interface SheetRow {
  key: string;
  label: string;
  value: string;
  status: 'ok' | 'bad' | 'empty';
  issue: string | null;
  /** Wiersz osoby z kolekcji (wcięty, bez wersalików). */
  sub: boolean;
  edit: () => void;
}

export interface SheetGroup {
  id: string;
  label: string;
  rows: SheetRow[];
  /** Błąd biznesowy przypięty do całej sekcji (np. „brak głównego PKD"). */
  issue: string | null;
}

export interface PipelineItem {
  id: string;
  label: string;
  color: string;
  pct: number;
  issues: number;
  status: string;
}

/**
 * Silnik przepływu command line. Generyczny — cała wiedza o polach, krokach i backendzie
 * pochodzi z APP_CONFIG (core/config). Odpowiednik renderStep/submitStep/goBack z mockupu.
 */
@Injectable({ providedIn: 'root' })
export class IntakeEngine {
  private readonly cfg = inject(APP_CONFIG);
  private readonly api = inject(CLIENT_API);
  private readonly dict = inject(DictionaryService);
  private readonly toast = inject(ToastService);
  readonly s = inject(IntakeStore);

  private readonly flow = this.cfg.flow;
  private readonly hookSnapshots = new Map<string, string>();
  private readonly hookRuns = new Map<string, Observable<void>>();
  private validationRun = 0;
  private prefilled = false;

  /** Czy `id` wskazuje na grupę (sekcję), a nie na pole — dla błędów przypiętych do sekcji. */
  private isGroupId(id: string): boolean {
    return this.flow.groups.some((g) => g.id === id);
  }

  /* ============================================================
   *  Widoki (computed)
   * ============================================================ */

  readonly prompt = computed<Prompt>(() => {
    const base: Prompt = {
      label: '',
      counter: '',
      placeholder: '',
      primary: 'Dalej ›',
      showBack: true,
      showApprove: false,
      disabled: false,
      field: null,
      options: [],
      allowCustom: false,
    };
    if (this.s.mode() === 'command') {
      return {
        ...base,
        label: 'Tryb komend (DEV)',
        counter: 'KOMENDY',
        placeholder: 'np. fake all, waliduj, podsumowanie, od nowa',
        primary: 'Wykonaj',
        showBack: false,
      };
    }
    const cur = this.s.cursor();
    const model = this.s.model();
    const editMode = this.s.editMode();

    if (cur.kind === 'field') {
      const field = this.flow.steps[cur.step].fields[cur.field];
      return {
        ...base,
        ...this.fieldPromptBits(field),
        label: field.label,
        counter: this.counterFor(cur.step),
        placeholder: field.placeholder ?? '',
        showBack: editMode !== 'flow' || this.prevPosition(cur) !== null,
      };
    }

    if (cur.kind === 'item') {
      const col = this.flow.steps[cur.step].collection!;
      const item = this.findItem(col, cur.itemId);
      const field = col.itemFields[cur.field];
      return {
        ...base,
        ...this.fieldPromptBits(field),
        label: `${field.label} — ${item ? col.itemLabel(item) : ''}`,
        counter: editMode === 'fix' ? this.fixCounter() : `Edycja · ${field.label.toLowerCase()}`,
        placeholder: field.placeholder ?? '',
      };
    }

    if (cur.kind === 'collection') {
      const col = this.flow.steps[cur.step].collection!;
      const st = this.s.collections()[cur.step];
      const counter = this.counterFor(cur.step);
      if (!st || st.phase === 'code') {
        return { ...base, label: col.label, counter, placeholder: col.placeholder, primary: 'Wczytaj', showBack: this.prevPosition(cur) !== null };
      }
      if (st.phase === 'loading') {
        return { ...base, label: col.label, counter, placeholder: col.placeholder, primary: 'Wczytaj', disabled: true };
      }
      if (st.phase === 'select') {
        return {
          ...base,
          label: col.label,
          counter,
          placeholder: col.placeholder,
          primary: 'Wczytaj ponownie',
          showApprove: true,
          showBack: this.prevPosition(cur) !== null,
        };
      }
      const entry = st.queue[st.q];
      const cand = st.candidates.find((c) => c.id === entry?.id);
      const field = entry ? col.itemFields[entry.field] : null;
      const active = st.candidates.filter((c) => !c.excluded);
      const personNo = cand ? active.findIndex((c) => c.id === cand.id) + 1 : 0;
      return {
        ...base,
        ...(field ? this.fieldPromptBits(field) : {}),
        label: field && cand ? `${field.label} — ${col.itemLabel(cand.item)}` : col.label,
        counter: field ? `Osoba ${personNo}/${active.length} · ${field.label.toLowerCase()}` : counter,
        placeholder: field?.placeholder ?? '',
      };
    }

    // done
    const status = this.s.validation();
    const issues = this.s.issues().length;
    if (status === 'pending') {
      return { ...base, label: 'Weryfikacja karty', counter: '…', placeholder: 'Trwa walidacja karty w usłudze…', disabled: true, showBack: false };
    }
    if (status === 'invalid') {
      return { ...base, label: 'Do poprawy', counter: `${issues} do poprawy`, placeholder: 'Enter — popraw pola po kolei', primary: 'Popraw ›' };
    }
    if (status === 'error') {
      return { ...base, label: 'Walidacja niedostępna', counter: 'Błąd', placeholder: 'Enter — spróbuj ponownie', primary: 'Ponów ›' };
    }
    return {
      ...base,
      label: 'Zakończono',
      counter: 'Gotowe',
      placeholder: 'Dane kompletne — ⌘K i „od nowa", aby zacząć ponownie',
      disabled: true,
    };
  });

  /** Mapa fieldId → komunikaty z walidacji karty (bez błędów przypiętych do sekcji). */
  readonly issueMap = computed(() => {
    const out = new Map<string, string[]>();
    for (const i of this.s.issues()) {
      if (!i.fieldId || this.isGroupId(i.fieldId)) continue;
      out.set(i.fieldId, [...(out.get(i.fieldId) ?? []), i.message]);
    }
    return out;
  });

  /** Mapa groupId → komunikaty przypięte do całej sekcji. */
  readonly sectionIssues = computed(() => {
    const out = new Map<string, string[]>();
    for (const i of this.s.issues()) {
      if (i.fieldId && this.isGroupId(i.fieldId)) out.set(i.fieldId, [...(out.get(i.fieldId) ?? []), i.message]);
    }
    return out;
  });

  readonly generalIssues = computed(() => this.s.issues().filter((i) => !i.fieldId));

  readonly sheet = computed<SheetGroup[]>(() => {
    const model = this.s.model();
    const issues = this.issueMap();
    return this.flow.groups.map((g) => {
      const rows: SheetRow[] = [];
      this.flow.steps.forEach((step, s) => {
        if (step.group !== g.id) return;
        if (step.collection) {
          rows.push(...this.collectionRows(s, step.collection, model, issues));
          return;
        }
        for (const field of step.fields) {
          if (field.inSheet === false) continue;
          const value = fieldDisplay(field, model, this.dict);
          const issue = issues.get(field.id)?.join(' ') ?? null;
          rows.push({
            key: field.id,
            label: field.sheetLabel ?? field.label,
            value,
            status: issue ? 'bad' : !value ? 'empty' : isFieldComplete(field, model, this.dict) ? 'ok' : 'bad',
            issue,
            sub: false,
            edit: () => this.editField(field.id),
          });
        }
      });
      return { id: g.id, label: g.label, rows, issue: this.sectionIssues().get(g.id)?.join(' ') ?? null };
    });
  });

  readonly pipeline = computed<PipelineItem[]>(() => {
    const progress = this.s.groupProgress();
    const optional = optionalGroups(this.flow, this.s.model(), this.dict);
    const issuesPerGroup = new Map<string, number>();
    for (const i of this.s.issues()) {
      const group = i.fieldId ? (this.isGroupId(i.fieldId) ? i.fieldId : this.groupOfField(i.fieldId)) : null;
      if (group) issuesPerGroup.set(group, (issuesPerGroup.get(group) ?? 0) + 1);
    }
    return this.flow.groups.map((g) => {
      const pct = progress[g.id] ?? 0;
      const issues = issuesPerGroup.get(g.id) ?? 0;
      const emptyStatus = optional.has(g.id) ? 'opcjonalne' : 'oczekuje';
      return {
        id: g.id,
        label: g.label,
        color: g.color,
        pct,
        issues,
        status: issues ? 'do poprawy' : pct >= 100 ? 'ukończono' : pct > 0 ? 'w toku' : emptyStatus,
      };
    });
  });

  /** Podpowiedzi komend (tryb komend). */
  commandSuggestions(query: string): CommandDef[] {
    const v = normalize(query);
    return this.cfg.commands.filter((c) => v === '' || normalize(c.cmd).includes(v));
  }

  /* ============================================================
   *  Start / restart
   * ============================================================ */

  start(): void {
    this.runPrefill(() => this.enterPosition(askedPositions(this.flow, this.s.model())[0]));
  }

  /** Wstępne wczytanie danych z usługi (raz na start/„od nowa") → potem normalne wejście. */
  private runPrefill(then: () => void): void {
    if (!this.flow.prefill || this.prefilled) {
      then();
      return;
    }
    this.prefilled = true;
    this.s.busy.set(true);
    this.setEcho('⏳ Wczytuję dane klienta…');
    this.flow.prefill(this.hookCtx()).subscribe({
      next: (res) => {
        this.s.busy.set(false);
        this.applyEffectResult(res);
        then();
      },
      error: () => {
        this.s.busy.set(false);
        this.toast.show('⚠ Nie udało się wczytać danych wstępnych');
        then();
      },
    });
  }

  restart(): void {
    this.validationRun++;
    this.prefilled = false;
    this.hookSnapshots.clear();
    this.hookRuns.clear();
    this.s.model.set(applyComputed(this.flow, this.flow.emptyModel()));
    this.s.collections.set({});
    this.s.issues.set([]);
    this.s.validation.set('idle');
    this.s.clientId.set(null);
    this.s.reachedEnd.set(false);
    this.s.editMode.set('flow');
    this.s.mode.set('form');
    this.s.busy.set(false);
    this.s.selectedGroup.set(null);
    this.start();
    this.toast.show('↺ Wyczyszczono kartę klienta');
  }

  /* ============================================================
   *  Akcje operatora
   * ============================================================ */

  submit(): void {
    const raw = this.s.draft();
    if (this.s.mode() === 'command') {
      this.runCommand(raw);
      return;
    }
    if (this.s.busy()) return;
    if (this.isFakeCommand(raw)) {
      this.runFake(raw);
      return;
    }
    const cur = this.s.cursor();
    switch (cur.kind) {
      case 'field':
        return this.submitField(cur.step, cur.field, raw);
      case 'collection':
        return this.submitCollection(cur.step, raw);
      case 'item':
        return this.submitItem(cur.step, cur.itemId, cur.field, raw);
      case 'done':
        if (this.s.validation() === 'invalid') this.startFix();
        else if (this.s.validation() === 'error') this.complete();
    }
  }

  back(): void {
    if (this.s.mode() === 'command' || this.s.busy()) return;
    const cur = this.s.cursor();
    const editMode = this.s.editMode();

    if (cur.kind === 'done') {
      if (this.s.validation() === 'pending') return;
      this.s.editMode.set('flow');
      const all = askedPositions(this.flow, this.s.model());
      this.enterPosition(all[all.length - 1], 'back');
      return;
    }
    if (cur.kind === 'collection') {
      const st = this.s.collections()[cur.step];
      if (st?.phase === 'qa') {
        if (st.q > 0) this.patchCollection(cur.step, { q: st.q - 1 });
        else this.patchCollection(cur.step, { phase: 'select' });
        this.renderCollection(cur.step);
        return;
      }
    }
    if (editMode === 'fix') {
      const i = this.s.fixIndex();
      if (i > 0) {
        this.s.fixIndex.set(i - 1);
        this.enterTarget(this.s.fixQueue()[i - 1]);
      } else this.showDone();
      return;
    }
    if (editMode === 'single' || cur.kind === 'item') {
      this.showDone();
      return;
    }
    const prev = this.prevPosition(cur);
    if (prev) this.enterPosition(prev, 'back');
  }

  /** Dwuklik w „Dane klienta" — edycja pola w command line. */
  editField(fieldId: string): void {
    this.prepareEdit();
    this.enterTarget(this.resolveEditTarget(fieldId));
  }

  /** Dwuklik w osobę z kolekcji — pytania tylko o tę osobę. */
  editItem(step: number, itemId: string): void {
    this.prepareEdit();
    this.s.editMode.set('single');
    this.enterItem(step, itemId, 0);
  }

  /** Dwuklik w wiersz kolekcji — ponowne otwarcie listy. */
  editCollection(step: number): void {
    this.prepareEdit();
    this.enterCollection(step, 'forward');
  }

  /** Przejście po polach z błędami walidacji karty. */
  startFix(): void {
    const order = (id: string) => {
      const p = this.positionOfTarget(id);
      return p ? p.step * 1000 + Math.max(p.field, 0) : 1e9;
    };
    const targets = [
      ...new Set(
        this.s
          .issues()
          .filter((i) => i.fieldId && !this.isGroupId(i.fieldId))
          .map((i) => this.resolveEditTarget(i.fieldId!)),
      ),
    ].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
    if (!targets.length) {
      this.setEcho('Brak pól do poprawy — błędy ogólne wymagają decyzji poza formularzem.', 'warning');
      return;
    }
    this.s.mode.set('form');
    this.s.editMode.set('fix');
    this.s.fixQueue.set(targets);
    this.s.fixIndex.set(0);
    this.enterTarget(targets[0]);
  }

  approveAll(step?: number): void {
    const s = step ?? this.currentCollectionStep();
    if (s === null) return;
    const col = this.flow.steps[s].collection!;
    const st = this.s.collections()[s];
    const active = st?.candidates.filter((c) => !c.excluded) ?? [];
    if (!active.length) {
      this.toast.show('⚠ Brak osób — przywróć kogoś albo wpisz inny kod');
      return;
    }
    const queue: { id: string; field: number }[] = [];
    for (const c of active) {
      col.itemFields.forEach((f, i) => isAsked(f, c.item) && queue.push({ id: c.id, field: i }));
    }
    this.patchCollection(s, {
      phase: 'qa',
      q: 0,
      queue,
      candidates: st!.candidates.map((c) => ({ ...c, done: false })),
    });
    this.renderCollection(s);
  }

  toggleExclude(step: number, id: string): void {
    const st = this.s.collections()[step];
    if (!st) return;
    this.patchCollection(step, {
      candidates: st.candidates.map((c) => (c.id === id ? { ...c, excluded: !c.excluded } : c)),
    });
    this.focus();
  }

  toggleCommandMode(on = this.s.mode() !== 'command'): void {
    this.s.mode.set(on ? 'command' : 'form');
    this.clearError();
    if (on) {
      this.s.draft.set('');
      this.setEcho(
        'Dostępne komendy: ' +
          this.cfg.commands.map((c) => `<strong>${c.cmd}</strong>`).join(', ') +
          '. Naciśnij <strong>⌘F</strong> (Ctrl+F), aby wrócić do formularza.',
      );
      this.focus();
    } else this.renderCurrent();
  }

  runCommand(raw: string): void {
    const v = normalize(raw);
    if (this.isFakeCommand(raw)) {
      this.runFake(raw);
      return;
    }
    const cmd = this.cfg.commands.find(
      (c) => c.action.type !== 'fake' && (normalize(c.cmd) === v || (c.aliases ?? []).some((a) => normalize(a) === v)),
    );
    switch (cmd?.action.type) {
      case 'summary':
        this.openSheet();
        this.setEcho('📋 Podsumowanie — rozwinięto „Dane klienta" na dole.', 'success');
        return;
      case 'validate':
        this.s.mode.set('form');
        this.complete();
        return;
      case 'fix':
        this.startFix();
        return;
      case 'restart':
        this.restart();
        return;
    }
    this.fail(
      'Nieznana komenda. Dostępne: ' + this.cfg.commands.map((c) => `<strong>${c.cmd}</strong>`).join(', ') + '.',
    );
  }

  openSheet(group?: string): void {
    this.s.sheetOpen.set(true);
    this.s.selectedGroup.set(group ?? null);
  }

  closeSheet(): void {
    this.s.sheetOpen.set(false);
    this.s.selectedGroup.set(null);
  }

  clearError(): void {
    this.s.inputError.set(false);
  }

  /* ============================================================
   *  Pola
   * ============================================================ */

  private submitField(stepIdx: number, fieldIdx: number, raw: string): void {
    const step = this.flow.steps[stepIdx];
    const field = step.fields[fieldIdx];
    this.commit(field, raw, this.s.model(), (value) => {
      this.setModel(applyField(field, value, this.s.model()));
      this.clearIssuesFor(field.id);
      const from = { step: stepIdx, field: fieldIdx };
      this.runFieldEffect(field, from, () => {
        this.runGroupHooks().subscribe();
        this.advance(from);
      });
    });
  }

  /** Efekt async pola (`onCommit`): strzał do usługi → patch/issues → dalej (albo zostań na polu z błędem). */
  private runFieldEffect(field: FieldDef, from: FlowPosition, then: () => void): void {
    if (!field.onCommit) {
      then();
      return;
    }
    this.s.busy.set(true);
    this.setEcho('⏳ Pobieram dane…');
    field.onCommit(this.hookCtx()).subscribe({
      next: (res) => {
        this.s.busy.set(false);
        this.applyEffectResult(res);
        // Błąd przypięty do właśnie zatwierdzonego pola → zostań na nim (showField pokaże komunikat).
        if ((res.issues ?? []).some((i) => i.fieldId === field.id)) this.enterPosition(from);
        else then();
      },
      error: () => {
        this.s.busy.set(false);
        this.toast.show('⚠ Nie udało się pobrać danych dla pola');
        then();
      },
    });
  }

  private enterPosition(pos: FlowPosition | undefined, dir: 'forward' | 'back' = 'forward'): void {
    if (!pos) {
      this.complete();
      return;
    }
    if (this.flow.steps[pos.step].collection) {
      this.enterCollection(pos.step, dir);
      return;
    }
    const field = this.flow.steps[pos.step].fields[pos.field];
    this.s.cursor.set({ kind: 'field', step: pos.step, field: pos.field });
    this.showField(field, this.s.model(), field.id);
  }

  /** Wspólne dla pól klienta i osób: prefill + echo (komunikat z walidacji ma pierwszeństwo). */
  private showField(field: FieldDef, model: Customer | CollectionItem, issueKey: string): void {
    this.clearError();
    const pre = fieldPrefill(field, model, this.dict);
    this.s.draft.set(pre.value);
    const issue = this.issueMap().get(issueKey);
    if (issue) {
      this.setEcho(`<strong>Usługa walidacji:</strong> ${issue.map(escapeHtml).join(' ')}`, 'warning');
    } else {
      const suffix = pre.suggested ? ' <span class="text-app-muted">· podpowiedź — Enter zatwierdza</span>' : '';
      this.setEcho(fieldHint(field, model) + suffix);
    }
    this.focus(this.s.editMode() !== 'flow' || !!issue);
  }

  /** Po zatwierdzeniu pola: dalej w kroku / następny krok / powrót do podsumowania. */
  private advance(from: FlowPosition): void {
    const model = this.s.model();
    const all = askedPositions(this.flow, model);
    const after = (p: FlowPosition) => p.step > from.step || (p.step === from.step && p.field > from.field);
    const editMode = this.s.editMode();

    if (editMode !== 'flow') {
      // Pozostałe pola tego samego kroku, które teraz trzeba uzupełnić (np. „nie" → adres wysyłki).
      const sameStep = all.find(
        (p) => p.step === from.step && p.field > from.field && p.field >= 0 &&
          !isFieldComplete(this.flow.steps[p.step].fields[p.field], model, this.dict),
      );
      if (sameStep) {
        this.enterPosition(sameStep);
        return;
      }
      if (editMode === 'fix') this.nextFix();
      else this.complete();
      return;
    }
    this.enterPosition(all.find(after));
  }

  private prevPosition(cur: Cursor): FlowPosition | null {
    if (cur.kind !== 'field' && cur.kind !== 'collection') return null;
    const from = { step: cur.step, field: cur.kind === 'field' ? cur.field : -1 };
    const before = askedPositions(this.flow, this.s.model()).filter(
      (p) => p.step < from.step || (p.step === from.step && p.field < from.field),
    );
    return before.length ? before[before.length - 1] : null;
  }

  /* ============================================================
   *  Kolekcje (osoby polecające)
   * ============================================================ */

  private enterCollection(step: number, dir: 'forward' | 'back'): void {
    const st = this.s.collections()[step];
    this.s.cursor.set({ kind: 'collection', step });
    if (!st || st.phase === 'loading') {
      this.s.collections.update((all) => ({ ...all, [step]: emptyCollection(st?.code ?? '') }));
    } else if (dir === 'back' && st.queue.length) {
      this.patchCollection(step, { phase: 'qa', q: st.queue.length - 1 });
    } else if (st.candidates.length || st.phase !== 'code') {
      this.patchCollection(step, { phase: 'select' });
    }
    this.renderCollection(step);
  }

  private renderCollection(step: number): void {
    const col = this.flow.steps[step].collection!;
    const st = this.s.collections()[step];
    this.clearError();
    if (st.phase === 'code') {
      this.s.draft.set(st.code);
      this.setEcho(col.hint);
    } else if (st.phase === 'loading') {
      this.setEcho(`⏳ Wczytuję: ${escapeHtml(col.label.toLowerCase())} dla kodu <strong>${escapeHtml(st.code)}</strong>…`);
    } else if (st.phase === 'select') {
      this.s.draft.set(st.code);
      if (!st.candidates.length) {
        this.setEcho(`Brak osób dla kodu <strong>${escapeHtml(st.code)}</strong> — wpisz inny kod.`, 'warning');
      } else {
        this.setEcho(
          'Wyszarz przyciskiem ✕ osoby, których nie chcesz (lub wpisz <strong>-2</strong> / <strong>+2</strong>). ' +
            'Następnie kliknij <strong>✓ Zatwierdź wszystkie</strong> albo naciśnij <strong>Enter</strong> — zapytam o każdą po kolei.',
        );
      }
    } else {
      const entry = st.queue[st.q];
      const cand = st.candidates.find((c) => c.id === entry.id)!;
      const field = col.itemFields[entry.field];
      const index = this.itemIndex(col, cand.id);
      this.showField(field, cand.item, index >= 0 ? `${col.target}[${index}].${field.id}` : '');
      return;
    }
    this.focus();
  }

  private submitCollection(step: number, raw: string): void {
    const col = this.flow.steps[step].collection!;
    const st = this.s.collections()[step];
    const code = raw.trim();
    if (st.phase === 'qa') {
      this.answerQueue(step, raw);
      return;
    }
    if (st.phase === 'select') {
      const toggle = /^([+-])\s*(\d+)$/.exec(code);
      if (toggle) {
        const cand = st.candidates[Number(toggle[2]) - 1];
        if (!cand) {
          this.fail(`Nie ma osoby nr ${escapeHtml(toggle[2])}.`);
          return;
        }
        if (cand.excluded !== (toggle[1] === '-')) this.toggleExclude(step, cand.id);
        this.s.draft.set(st.code);
        return;
      }
      if (code === st.code) {
        this.approveAll(step);
        return;
      }
    }
    if (!col.codePattern.test(code)) {
      this.fail(col.codeError);
      return;
    }
    this.loadCollection(step, code);
  }

  private loadCollection(step: number, code: string): void {
    const col = this.flow.steps[step].collection!;
    this.s.collections.update((all) => ({ ...all, [step]: { ...emptyCollection(code), phase: 'loading' } }));
    this.s.busy.set(true);
    this.renderCollection(step);
    col.load(code, this.hookCtx()).subscribe({
      next: (items) => {
        this.s.busy.set(false);
        const known = new Map(this.collectionItems(col).map((i) => [i.id, i]));
        const candidates: Candidate[] = items.map((item) => ({
          id: item.id,
          // Osoba już zapisana na karcie → zachowaj odpowiedzi jako podpowiedź.
          item: known.get(item.id) ?? item,
          excluded: false,
          done: false,
        }));
        this.patchCollection(step, { phase: 'select', candidates });
        if (this.s.cursor().kind === 'collection') this.renderCollection(step);
      },
      error: () => {
        this.s.busy.set(false);
        this.patchCollection(step, { phase: 'code' });
        this.fail('Nie udało się pobrać osób — spróbuj ponownie.');
      },
    });
  }

  private answerQueue(step: number, raw: string): void {
    const col = this.flow.steps[step].collection!;
    const st = this.s.collections()[step];
    const entry = st.queue[st.q];
    const cand = st.candidates.find((c) => c.id === entry.id)!;
    const field = col.itemFields[entry.field];
    this.commit(field, raw, cand.item, (value) => {
      const item = applyField(field, value, cand.item);
      const lastForPerson = st.queue[st.q + 1]?.id !== cand.id;
      const candidates = st.candidates.map((c) => (c.id === cand.id ? { ...c, item, done: c.done || lastForPerson } : c));
      const q = st.q + 1;
      this.patchCollection(step, { candidates, q });
      if (q >= st.queue.length) this.finishCollection(step);
      else this.renderCollection(step);
    });
  }

  private finishCollection(step: number): void {
    const col = this.flow.steps[step].collection!;
    const st = this.s.collections()[step];
    const items = st.candidates.filter((c) => c.done && !c.excluded).map((c) => c.item);
    this.setModel(setPath(this.s.model(), col.target, items));
    this.s.issues.update((list) =>
      list.filter((i) => !i.fieldId || !(i.fieldId === col.target || i.fieldId.startsWith(`${col.target}[`))),
    );
    this.toast.show(`✓ Zapisano ${col.label.toLowerCase()}: ${items.length}`);
    this.runGroupHooks().subscribe();
    this.advance({ step, field: Number.MAX_SAFE_INTEGER });
  }

  private enterItem(step: number, itemId: string, field: number): void {
    const col = this.flow.steps[step].collection!;
    const item = this.findItem(col, itemId);
    if (!item) {
      this.showDone();
      return;
    }
    this.s.cursor.set({ kind: 'item', step, itemId, field });
    const f = col.itemFields[field];
    this.showField(f, item, `${col.target}[${this.itemIndex(col, itemId)}].${f.id}`);
  }

  private submitItem(step: number, itemId: string, fieldIdx: number, raw: string): void {
    const col = this.flow.steps[step].collection!;
    const item = this.findItem(col, itemId);
    if (!item) return;
    const field = col.itemFields[fieldIdx];
    const index = this.itemIndex(col, itemId);
    this.commit(field, raw, item, (value) => {
      const updated = applyField(field, value, item);
      this.setModel(setPath(this.s.model(), `${col.target}[${index}]`, updated));
      // Lista kandydatów też ma aktualne dane (gdy operator wróci do kolekcji).
      const st = this.s.collections()[step];
      if (st) {
        this.patchCollection(step, {
          candidates: st.candidates.map((c) => (c.id === itemId ? { ...c, item: updated } : c)),
        });
      }
      this.clearIssuesFor(`${col.target}[${index}].${field.id}`);
      this.runGroupHooks().subscribe();
      if (this.s.editMode() === 'single' && fieldIdx + 1 < col.itemFields.length) {
        this.enterItem(step, itemId, fieldIdx + 1);
      } else if (this.s.editMode() === 'fix') this.nextFix();
      else this.complete();
    });
  }

  /* ============================================================
   *  Walidacja karty i poprawki
   * ============================================================ */

  /** Koniec przepływu: zapisz zaległe grupy → walidacja karty w usłudze. */
  complete(): void {
    const run = ++this.validationRun;
    this.s.reachedEnd.set(true);
    this.s.editMode.set('flow');
    this.s.cursor.set({ kind: 'done' });
    this.s.validation.set('pending');
    this.s.draft.set('');
    this.clearError();
    this.setEcho('⏳ Weryfikuję kartę klienta w usłudze walidacji…');
    this.runGroupHooks()
      .pipe(switchMap(() => this.flow.validateCard(this.s.model(), this.hookCtx())))
      .subscribe({
        next: (issues) => {
          if (run !== this.validationRun) return;
          this.s.issues.set(issues);
          this.s.validation.set(issues.length ? 'invalid' : 'valid');
          if (!issues.length) this.toast.show(`✓ Zapisano klienta: ${this.flow.title(this.s.model())}`);
          if (this.s.cursor().kind === 'done') this.showDone();
        },
        error: () => {
          if (run !== this.validationRun) return;
          this.s.validation.set('error');
          if (this.s.cursor().kind === 'done') this.showDone();
        },
      });
  }

  /** Ekran końcowy według statusu walidacji (bez ponownego wywołania usługi). */
  private showDone(): void {
    if (this.s.validation() === 'idle') {
      this.complete();
      return;
    }
    this.s.editMode.set('flow');
    this.s.cursor.set({ kind: 'done' });
    this.s.draft.set('');
    this.clearError();
    const status = this.s.validation();
    if (status === 'pending') {
      this.setEcho('⏳ Weryfikuję kartę klienta w usłudze walidacji…');
    } else if (status === 'valid') {
      this.setEcho(
        '🎉 Wszystkie dane zostały wprowadzone poprawnie i zweryfikowane. Możesz cofnąć się lub kliknąć dwukrotnie pole w „Dane klienta", aby poprawić dane.',
        'success',
      );
    } else if (status === 'error') {
      this.setEcho('Usługa walidacji jest niedostępna. Naciśnij <strong>Enter</strong>, aby spróbować ponownie.', 'error');
    } else {
      const issues = this.s.issues();
      const list = issues
        .map((i) => `<li>• <strong>${escapeHtml(this.issueLabel(i.fieldId))}</strong> — ${escapeHtml(i.message)}</li>`)
        .join('');
      this.setEcho(
        `Usługa walidacji zgłosiła <strong>${issues.length}</strong> ${plural(issues.length, 'problem', 'problemy', 'problemów')}:` +
          `<ul class="my-1 space-y-0.5">${list}</ul>` +
          'Naciśnij <strong>Enter</strong>, aby poprawić po kolei, albo kliknij dwukrotnie pole w „Dane klienta".',
        'warning',
      );
    }
    this.focus();
  }

  private nextFix(): void {
    const i = this.s.fixIndex() + 1;
    const queue = this.s.fixQueue();
    if (i >= queue.length) {
      this.complete();
      return;
    }
    this.s.fixIndex.set(i);
    this.enterTarget(queue[i]);
  }

  private fixCounter(): string {
    return `Poprawka ${this.s.fixIndex() + 1}/${this.s.fixQueue().length}`;
  }

  private counterFor(step: number): string {
    if (this.s.editMode() === 'fix') return this.fixCounter();
    const { n, total } = stepNumber(this.flow, this.s.model(), step);
    return `Krok ${n} / ${total}`;
  }

  /* ============================================================
   *  Cele edycji: id pola → kursor
   * ============================================================ */

  private prepareEdit(): void {
    this.s.mode.set('form');
    this.closeSheet();
    this.s.editMode.set(this.s.reachedEnd() ? 'single' : 'flow');
  }

  /** Uwzględnia FieldDef.editTarget (np. adres wysyłki „taki sam" → pytanie tak/nie). */
  private resolveEditTarget(fieldId: string): string {
    const pos = findField(this.flow, fieldId);
    if (!pos) return fieldId;
    const field = this.flow.steps[pos.step].fields[pos.field];
    return field.editTarget?.(this.s.model()) ?? fieldId;
  }

  private enterTarget(fieldId: string): void {
    const itemPath = parseItemPath(fieldId);
    if (itemPath) {
      const step = findCollectionStep(this.flow, itemPath.list);
      const col = this.flow.steps[step]?.collection;
      const item = col ? (this.collectionItems(col)[itemPath.index] as CollectionItem | undefined) : undefined;
      const field = col ? col.itemFields.findIndex((f) => f.id === itemPath.field) : -1;
      if (item && field !== -1) {
        this.enterItem(step, item.id, field);
        return;
      }
    }
    const colStep = findCollectionStep(this.flow, fieldId);
    if (colStep !== -1) {
      this.enterCollection(colStep, 'forward');
      return;
    }
    const pos = findField(this.flow, fieldId);
    if (pos) this.enterPosition(pos);
    else this.showDone();
  }

  private positionOfTarget(fieldId: string): FlowPosition | null {
    const itemPath = parseItemPath(fieldId);
    const list = itemPath?.list ?? fieldId;
    const colStep = findCollectionStep(this.flow, list);
    if (colStep !== -1) return { step: colStep, field: itemPath ? itemPath.index : -1 };
    return findField(this.flow, fieldId);
  }

  private groupOfField(fieldId: string): string | null {
    const pos = this.positionOfTarget(fieldId);
    return pos ? this.flow.steps[pos.step].group : null;
  }

  private issueLabel(fieldId: string | null): string {
    if (!fieldId) return 'Karta';
    const itemPath = parseItemPath(fieldId);
    if (itemPath) {
      const col = this.flow.steps[findCollectionStep(this.flow, itemPath.list)]?.collection;
      const item = col ? (this.collectionItems(col)[itemPath.index] as CollectionItem | undefined) : undefined;
      const field = col?.itemFields.find((f) => f.id === itemPath.field);
      if (col && item) return `${col.itemLabel(item)} · ${field?.label ?? itemPath.field}`;
    }
    const colStep = findCollectionStep(this.flow, fieldId);
    if (colStep !== -1) return this.flow.steps[colStep].collection!.sheetLabel;
    const pos = findField(this.flow, fieldId);
    if (!pos) return fieldId;
    const f = this.flow.steps[pos.step].fields[pos.field];
    return f.sheetLabel ?? f.label;
  }

  private clearIssuesFor(fieldId: string): void {
    this.s.issues.update((list) =>
      list.filter((i) => !i.fieldId || (i.fieldId !== fieldId && this.resolveEditTarget(i.fieldId) !== fieldId)),
    );
  }

  /* ============================================================
   *  Grupy: hooki po skompletowaniu (wstępny zapis REST)
   * ============================================================ */

  private runGroupHooks(): Observable<void> {
    const model = this.s.model();
    const progress = this.s.groupProgress();
    const runs: Observable<void>[] = [];
    for (const group of this.flow.groups) {
      if (!group.onComplete || (progress[group.id] ?? 0) < 100) continue;
      const snapshot = this.groupSnapshot(group.id, model);
      if (this.hookSnapshots.get(group.id) !== snapshot) {
        this.hookSnapshots.set(group.id, snapshot);
        const run$ = group.onComplete(this.hookCtx()).pipe(
          tap((res) => this.applyEffectResult(res, group.id)),
          catchError(() => {
            this.hookSnapshots.delete(group.id);
            this.toast.show(`⚠ Nie udało się zapisać: ${group.label}`);
            return of(undefined);
          }),
          toArray(),
          map(() => undefined),
          shareReplay(1),
        );
        this.hookRuns.set(group.id, run$);
        run$.subscribe();
      }
      const run = this.hookRuns.get(group.id);
      if (run) runs.push(run);
    }
    return runs.length ? forkJoin(runs).pipe(map(() => undefined)) : of(undefined);
  }

  private groupSnapshot(groupId: string, model: Customer): string {
    return JSON.stringify(
      this.flow.steps
        .filter((s) => s.group === groupId && !s.collection)
        .flatMap((s) => s.fields.map((f) => fieldInput(f, model, this.dict))),
    );
  }

  /* ============================================================
   *  DEV: fake …
   * ============================================================ */

  private isFakeCommand(raw: string): boolean {
    const v = normalize(raw);
    return v === 'fake' || v.startsWith('fake ');
  }

  private runFake(raw: string): void {
    const what = normalize(raw).split(' ')[1] || 'all';
    const key = this.cfg.fake.aliases[what] ?? what;
    let model = this.s.model();
    let label: string;
    if (key === 'all') {
      for (const p of this.cfg.fake.all) model = this.cfg.fake.presets[p].fill(model);
      label = 'wszystkie sekcje';
    } else if (this.cfg.commands.some((c) => c.action.type === 'fake' && c.action.preset === key)) {
      model = this.cfg.fake.presets[key].fill(model);
      label = this.cfg.fake.presets[key].label;
    } else {
      const known = this.cfg.commands.filter((c) => c.action.type === 'fake').map((c) => `<strong>${c.cmd}</strong>`);
      this.fail(`✗ Nieznana komenda dev: "fake ${escapeHtml(what)}". Dostępne: ${known.join(', ')}.`);
      return;
    }
    this.setModel(model);
    if (this.s.mode() === 'form') this.renderCurrent();
    this.setEcho(`🧪 [DEV] Wypełniono: ${label}.`, 'success');
  }

  /* ============================================================
   *  Pomocnicze
   * ============================================================ */

  /** Parse + walidatory sync, potem async (jeśli są) → onOk(wartość). */
  private commit(field: FieldDef, raw: string, model: Customer | CollectionItem, onOk: (value: unknown) => void): void {
    const res = evaluateField(field, raw, model, this.dict);
    if (!res.ok) {
      this.fail(res.reason);
      return;
    }
    const asyncs = field.asyncValidators ?? [];
    if (!asyncs.length) {
      onOk(res.value);
      return;
    }
    this.s.busy.set(true);
    this.setEcho('⏳ Sprawdzam…');
    forkJoin(asyncs.map((v) => v(res.value, model, this.api))).subscribe({
      next: (reasons) => {
        this.s.busy.set(false);
        const reason = reasons.find(Boolean);
        if (reason) this.fail(reason);
        else onOk(res.value);
      },
      error: () => {
        this.s.busy.set(false);
        this.fail('Nie udało się zweryfikować wartości — spróbuj ponownie.');
      },
    });
  }

  private renderCurrent(): void {
    const cur = this.s.cursor();
    if (cur.kind === 'field') this.enterPosition({ step: cur.step, field: cur.field });
    else if (cur.kind === 'collection') this.renderCollection(cur.step);
    else if (cur.kind === 'item') this.enterItem(cur.step, cur.itemId, cur.field);
    else this.showDone();
  }

  private fieldPromptBits(field: FieldDef): Pick<Prompt, 'field' | 'options' | 'allowCustom'> {
    return { field, options: fieldOptions(field, this.dict), allowCustom: !!field.allowCustom };
  }

  private setModel(model: Customer): void {
    this.s.model.set(applyComputed(this.flow, model));
  }

  private setEcho(html: string, type: EchoType = 'info'): void {
    this.s.echo.set({ html, type });
  }

  private fail(reason: string): void {
    this.s.inputError.set(true);
    this.s.errorTick.update((n) => n + 1);
    this.setEcho(reason, 'error');
  }

  private focus(select = false): void {
    this.s.focusTick.update((t) => ({ n: t.n + 1, select }));
  }

  private hookCtx(): HookContext<Customer> {
    return {
      model: this.s.model(),
      api: this.api,
      clientId: this.s.clientId(),
      setClientId: (id) => this.s.clientId.set(id),
    };
  }

  /**
   * Zastosuj wynik efektu async: patch (scalony do modelu), toast, issues (błędy biznesowe).
   * `groupId` podany (onComplete) → issues zastępują poprzedni zestaw tej grupy; w innym razie
   * (prefill/onCommit) → issues dołączane bez duplikatów. String traktowany jak sam toast.
   */
  private applyEffectResult(res: EffectResult<Customer> | string | void, groupId?: string): void {
    if (!res) return;
    if (typeof res === 'string') {
      this.toast.show(res);
      return;
    }
    if (res.patch) this.setModel({ ...this.s.model(), ...res.patch });
    if (res.toast) this.toast.show(res.toast);
    if (res.issues) {
      if (groupId) this.replaceGroupIssues(groupId, res.issues);
      else this.mergeIssues(res.issues);
    }
  }

  private mergeIssues(fresh: FieldIssue[]): void {
    const key = (i: FieldIssue) => `${i.fieldId ?? ''}|${i.message}`;
    this.s.issues.update((list) => {
      const seen = new Set(list.map(key));
      return [...list, ...fresh.filter((i) => !seen.has(key(i)))];
    });
  }

  /** Wymień issues należące do danej grupy (pola grupy + błąd sekcji z fieldId = id grupy). */
  private replaceGroupIssues(groupId: string, fresh: FieldIssue[]): void {
    this.s.issues.update((list) => [
      ...list.filter((i) => !this.issueBelongsToGroup(i, groupId)),
      ...fresh,
    ]);
  }

  private issueBelongsToGroup(i: FieldIssue, groupId: string): boolean {
    if (!i.fieldId) return false;
    return i.fieldId === groupId || this.groupOfField(i.fieldId) === groupId;
  }

  private patchCollection(step: number, patch: Partial<CollectionState>): void {
    this.s.collections.update((all) => ({ ...all, [step]: { ...all[step], ...patch } }));
  }

  private currentCollectionStep(): number | null {
    const cur = this.s.cursor();
    return cur.kind === 'collection' ? cur.step : null;
  }

  private collectionItems(col: CollectionDef): CollectionItem[] {
    const items = getPath(this.s.model(), col.target);
    return Array.isArray(items) ? items : [];
  }

  private findItem(col: CollectionDef, id: string): CollectionItem | undefined {
    return this.collectionItems(col).find((i) => i.id === id);
  }

  private itemIndex(col: CollectionDef, id: string): number {
    return this.collectionItems(col).findIndex((i) => i.id === id);
  }

  private collectionRows(step: number, col: CollectionDef, model: Customer, issues: Map<string, string[]>): SheetRow[] {
    const items = this.collectionItems(col);
    const ownIssue = issues.get(col.target)?.join(' ') ?? null;
    const itemIssues = items.map((_, i) =>
      [...issues.entries()].filter(([k]) => k.startsWith(`${col.target}[${i}].`)).flatMap(([, v]) => v),
    );
    const anyItemIssue = itemIssues.some((l) => l.length);
    const rows: SheetRow[] = [
      {
        key: col.target,
        label: col.sheetLabel,
        value: items.length ? col.summary(items) : '',
        status: ownIssue || anyItemIssue ? 'bad' : items.length ? 'ok' : 'empty',
        issue: ownIssue,
        sub: false,
        edit: () => this.editCollection(step),
      },
    ];
    items.forEach((item, i) => {
      rows.push({
        key: `${col.target}[${i}]`,
        label: col.itemLabel(item),
        value: col.itemFields.map((f) => fieldDisplay(f, item, this.dict)).filter(Boolean).join(' · '),
        status: itemIssues[i].length ? 'bad' : 'ok',
        issue: itemIssues[i].length ? itemIssues[i].join(' ') : null,
        sub: true,
        edit: () => this.editItem(step, item.id),
      });
    });
    return rows;
  }
}

function emptyCollection(code: string): CollectionState {
  return { code, phase: 'code', candidates: [], queue: [], q: 0 };
}
