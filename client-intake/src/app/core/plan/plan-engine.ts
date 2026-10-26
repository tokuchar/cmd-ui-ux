import { computed, inject, Injectable, signal } from '@angular/core';
import { buildCorrectionPrompt, buildPlanPrompt } from '../ai/prompt-builder';
import { APP_CONFIG } from '../config/app-config';
import { e1rm, hrZones, suggestLoad } from '../domain/calc';
import { EVENT_TYPES, EventType } from '../config/events.config';
import { assessEvents, VERDICT_LABELS } from './events';
import { buildStats, statsText } from './stats';
import { AREA_KEYWORDS, AREA_LIFTS, hasInjuryDecision, injuryFor, isSevere } from '../domain/injuries';
import { formatSet, methodLabel, resolveLoad } from '../domain/loads';
import { guessEntry } from '../config/steps/helpers';
import { formatLift, parseLift } from '../engine/field-types';
import { escapeHtml, normalize } from '../engine/text';
import { DAY_CODES, DAY_LABELS, DayCode, ExerciseBlock, FOCUS_LABELS, LiftKey, Session, sessionKey, WeekRef } from '../models/plan.model';
import { DictionaryService } from '../services/dictionary.service';
import { IntakeStore } from '../state/intake.store';
import { copyText } from '../storage/clipboard';
import { downloadJson } from '../storage/local-store';
import { parsePlanImport, PlanIssue } from '../validation/plan.validator';
import { buildDemoPlan } from './demo-plan';
import { LIFT_ALIASES, PLAN_COMMANDS, PlanCommandDef } from './plan-commands';
import { PlanStore } from './plan.store';

/** Co pokazuje panel szczegółów pod grafem. */
export type PlanPanel = 'week' | 'macro' | 'diet' | 'tips' | 'recovery' | 'cardio' | 'prehab' | 'goals' | 'loads' | 'history' | 'import' | 'help' | 'log' | 'events';

export interface PlanEcho {
  html: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

/** Sesja z kontekstem tygodnia (komendy działają na „bieżącej" sesji). */
export interface SessionRef {
  key: string;
  week: number;
  index: number;
  session: Session;
  ref: WeekRef;
}

/** Seria do pokazania: ciężar · powtórzenia · tempo · RIR + skąd ciężar i ostrzeżenia. */
export interface LoadRow {
  exercise: string;
  /** „4 × 5 · 100 kg · 20X1 · RIR 2" */
  set: string;
  kg: number | null;
  rir: number | null;
  tempo: string | null;
  /** „RTS", „65%", „wzór -25% ≤60 kg"… */
  method: string;
  /** Uzasadnienie metody od AI (load.note). */
  note: string | null;
  /** Decyzja AI przy kontuzji (injuryNote). */
  injury: string | null;
  warning: string | null;
  basis: string;
}

const DAY_ORDER = Object.fromEntries(DAY_CODES.map((d, i) => [d, i])) as Record<DayCode, number>;
const JS_DAY: DayCode[] = ['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'so'];

/**
 * Silnik command line widoku planu: parsuje komendy, zmienia PlanStore i ustawia panel + echo.
 * Odpowiednik IntakeEngine dla planu — UI (PlanConsole, PlanGraph) tylko czyta stan.
 */
@Injectable({ providedIn: 'root' })
export class PlanEngine {
  readonly store = inject(PlanStore);
  private readonly intake = inject(IntakeStore);
  private readonly cfg = inject(APP_CONFIG);
  private readonly dict = inject(DictionaryService);

  readonly draft = signal('');
  readonly echo = signal<PlanEcho>({ html: '', type: 'info' });
  readonly panel = signal<PlanPanel>('week');
  /** modify = edycja serii otwartej sesji krok po kroku (komenda `modyfikuj`). */
  readonly mode = signal<'command' | 'modify'>('command');
  readonly errorTick = signal(0);
  readonly importIssues = signal<PlanIssue[]>([]);
  /** Filtr kategorii porad (`porady zdrowie`). */
  readonly tipFilter = signal<string | null>(null);
  private readonly historyList = signal<string[]>([]);
  private historyIndex = -1;

  readonly profile = this.intake.model;
  /** Krok zaokrąglenia: 1,25 kg z mikrotalerzami (sprzęt w profilu), inaczej 2,5 kg. */
  readonly plateStep = computed(() => ((this.profile().sprzet_dostepny ?? []).includes('mikrotalerze') ? 1.25 : 2.5));

  /** Sesja, na której działają komendy: otwarta w szufladzie albo kolejna niewykonana. */
  readonly activeSession = computed<SessionRef | null>(() => {
    const open = this.store.openSession();
    return (open ? this.sessionByKey(open) : null) ?? this.nextSession();
  });

  /** Strefy tętna z profilu (Karvonen / % HRmax). */
  readonly zones = computed(() => hrZones(this.profile()));
  /** Ocena „czy przegenerować" ze zdarzeń od ostatniego przegenerowania. */
  readonly assessment = computed(() => assessEvents(this.store.events(), this.store.regens()));
  /** Statystyki z logów (makro, waga, sen, cardio, sesje, e1RM) — do panelu i promptu korekty. */
  readonly stats = computed(() =>
    buildStats({
      daily: this.store.daily(),
      weeks: this.store.weeks(),
      head: this.store.head(),
      status: this.store.state().status,
      log: this.store.log(),
      bodyKg: this.profile().masa_kg,
      tempoPct: this.profile().tempo,
      faza: this.profile().faza,
    }),
  );

  /** Ciężary dla aktywnej sesji (panel „loads" i `sugeruj ciezary`). */
  readonly loads = computed<LoadRow[]>(() => {
    const s = this.activeSession();
    if (!s) return [];
    return [...s.session.main, ...s.session.accessories].map((b) => this.loadRow(b));
  });

  suggestions(query: string): PlanCommandDef[] {
    const q = normalize(query);
    if (this.mode() === 'modify') return [];
    return PLAN_COMMANDS.filter((c) => !q || normalize(c.cmd).startsWith(q) || (c.aliases ?? []).some((a) => normalize(a).startsWith(q)));
  }

  /** Szary podpis argumentów za wpisaną komendą. */
  ghost(raw: string): string {
    if (this.mode() === 'modify') return raw ? '' : 'nr SxR@RPE · nr usun · + nazwa SxR@RPE · gotowe';
    const q = normalize(raw);
    if (!q) return '';
    const exact = PLAN_COMMANDS.find((c) => normalize(c.cmd) === q);
    if (exact?.args) return (raw.endsWith(' ') ? '' : ' ') + exact.args;
    const hit = PLAN_COMMANDS.find((c) => normalize(c.cmd).startsWith(q));
    return hit ? hit.cmd.slice(q.length) + (hit.args ? ' ' + hit.args : '') : '';
  }

  /** Pierwsza komenda pasująca do wpisu (Tab). */
  completion(raw: string): string | null {
    const q = normalize(raw);
    const hit = q ? PLAN_COMMANDS.find((c) => normalize(c.cmd).startsWith(q) && normalize(c.cmd) !== q) : null;
    return hit ? hit.cmd + (hit.args ? ' ' : '') : null;
  }

  historyStep(dir: 1 | -1): string | null {
    const list = this.historyList();
    if (!list.length) return null;
    this.historyIndex = Math.min(Math.max(this.historyIndex + (dir === -1 ? 1 : -1), -1), list.length - 1);
    return this.historyIndex === -1 ? '' : list[list.length - 1 - this.historyIndex];
  }

  /* ============================================================
   *  Wykonanie
   * ============================================================ */

  run(raw: string): void {
    const text = raw.trim();
    this.historyIndex = -1;
    if (!text) {
      if (this.mode() === 'command') this.cmdNext();
      return;
    }
    this.historyList.update((h) => [...h.filter((x) => x !== text), text].slice(-50));
    this.draft.set('');
    if (this.mode() === 'modify') {
      this.modify(text);
      return;
    }
    const { cmd, args } = matchCommand(text);
    if (!cmd) {
      this.fail(`Nieznana komenda „${escapeHtml(text)}". Wpisz <strong>pomoc</strong>, aby zobaczyć listę.`);
      return;
    }
    if (!this.store.plan() && !['importuj', 'demo', 'prompt', 'pomoc', 'historia', 'cofnij', 'zglos', 'makro', 'waga', 'stan'].includes(cmd.cmd)) {
      this.fail('Brak planu. Wpisz <strong>importuj</strong> (JSON z AI) albo <strong>demo</strong>.');
      return;
    }
    const handlers: Record<string, (args: string) => void> = {
      nastepny: () => this.cmdNext(),
      dzis: () => this.cmdToday(),
      tydzien: (a) => this.cmdWeek(a),
      idz: (a) => this.cmdWeek(a),
      makro: (a) => (a.trim() ? this.logMacros(a) : this.show('macro', '🗺 Makrocykl — gałęzie to mezocykle, ◐ deload, ◆ start, ↻ przegenerowanie. Klik w węzeł = tydzień.')),
      mezo: (a) => this.cmdMeso(a),
      dieta: () => this.cmdDiet(),
      kofeina: () => this.cmdCaffeine(),
      porady: (a) => this.cmdTips(a),
      sen: (a) => (a.trim() ? this.logSleep(a) : this.cmdRecovery()),
      cardio: (a) => (a.trim() ? this.logCardio(a) : this.cmdCardio()),
      waga: (a) => this.logWeight(a),
      zglos: (a) => this.cmdReport(a),
      stan: () => this.cmdAssess(),
      prehab: () => this.show('prehab', '🧘 Rozgrzewka i prehab w sesjach tygodnia.'),
      deload: () => this.cmdDeload(),
      cele: () => this.show('goals', '🎯 Cele dodatkowe — gałęzie równoległe w grafie.'),
      'sugeruj ciezary': (a) => this.cmdLoads(a),
      zaloguj: (a) => this.cmdLog(a),
      zrobione: () => this.cmdStatus('done'),
      pomin: () => this.cmdStatus('skipped'),
      zamien: (a) => this.cmdSwap(a),
      modyfikuj: () => this.cmdModify(),
      przesun: (a) => this.cmdMove(a),
      krocej: (a) => this.cmdShorten(a),
      kontuzja: (a) => this.cmdInjury(a),
      prompt: () => this.cmdPrompt(),
      'prompt korekta': () => this.cmdCorrection(),
      importuj: () => this.show('import', 'Wklej odpowiedź AI w polu poniżej — sprawdzę ją na żywo. Pełny plan albo <code>{ "microcycles": [...] }</code>.'),
      eksport: () => this.cmdExport(),
      historia: () => this.show('history', `🕘 Wersje planu: ${this.store.history().length}. <strong>cofnij</strong> przywraca ostatnią.`),
      cofnij: () => this.cmdRevert(),
      demo: () => this.cmdDemo(),
      pomoc: () => this.show('help', 'Komendy planu — Enter na pustym polu = <strong>nastepny</strong>.'),
    };
    handlers[cmd.cmd](args);
  }

  /** Klik / Enter w tygodniu grafu. */
  selectWeek(week: number): void {
    this.store.selectedWeek.set(week === this.store.head() ? null : week);
    this.store.openSession.set(null);
    this.panel.set('week');
    const ref = this.store.currentRef();
    if (ref) this.say(this.weekSummary(ref));
  }

  openSession(key: string): void {
    const s = this.sessionByKey(key);
    if (!s) return;
    this.store.selectedWeek.set(s.week === this.store.head() ? null : s.week);
    this.store.openSession.set(key);
    this.say(`🏋 <strong>${escapeHtml(s.session.name)}</strong> · W${s.week} ${DAY_LABELS[s.session.day]} · ${s.session.durationMin} min. ` + 'Komendy: <strong>sugeruj ciezary</strong>, <strong>zrobione</strong>, <strong>modyfikuj</strong>, <strong>krocej 45</strong>.');
  }

  closeSession(): void {
    this.store.openSession.set(null);
    if (this.mode() === 'modify') this.mode.set('command');
  }

  /** Import z pola tekstowego (panel „import"). Zwraca true, gdy zapisano. */
  importText(raw: string, apply: boolean): boolean {
    if (!raw.trim()) {
      this.importIssues.set([]);
      return false;
    }
    const res = parsePlanImport(raw, { injuries: this.profile().kontuzje ?? [], health: this.profile().choroby_leki });
    this.importIssues.set(res.issues);
    if (!apply || res.kind === 'invalid') return false;
    const churn = this.assessment().churn;
    const score = this.assessment().score;
    if (res.kind === 'plan') {
      this.store.setPlan(res.plan, 'Import z AI', score);
      this.say(`Zaimportowano plan: <strong>${escapeHtml(res.plan.meta.goal)}</strong> · ${this.store.weeks().length} tyg.`, 'success');
    } else {
      if (!this.store.plan()) {
        this.fail('Patch tygodni wymaga istniejącego planu — najpierw zaimportuj pełny plan.');
        return false;
      }
      this.store.applyCorrection(res.microcycles, 'Korekta AI', score, res.nutrition);
      const what = [res.microcycles.length ? `tygodnie ${res.microcycles.map((w) => `W${w.week}`).join(', ')}` : '', res.nutrition ? 'strategię żywienia' : '']
        .filter(Boolean)
        .join(' i ');
      this.say(
        `Podmieniono ${what} (↻ na grafie). Poprzednia wersja w <strong>historia</strong>.` +
          (churn.length ? `<br>${churn.map(escapeHtml).join('<br>')}` : ''),
        churn.length ? 'warning' : 'success',
      );
    }
    this.importIssues.set([]);
    this.panel.set('week');
    return true;
  }

  /* ============================================================
   *  Komendy
   * ============================================================ */

  private cmdNext(): void {
    const next = this.nextSession();
    if (!next) {
      this.say('🎉 Wszystkie sesje planu wykonane. <strong>prompt korekta</strong> albo nowy plan z AI.', 'success');
      return;
    }
    this.openSession(next.key);
    this.panel.set('loads');
  }

  private cmdToday(): void {
    const today = JS_DAY[new Date().getDay()];
    const ref = this.store.weeks().find((w) => w.micro.week === this.store.head());
    if (!ref) return;
    this.store.selectedWeek.set(null);
    const index = ref.micro.sessions.findIndex((s) => s.day === today);
    if (index !== -1) {
      this.openSession(sessionKey(ref.micro.week, ref.micro.sessions[index], index));
      this.panel.set('loads');
      return;
    }
    const cardio = ref.micro.cardio.filter((c) => c.day === today);
    const carbs = ref.micro.nutrition.highCarbDays.includes(today);
    const n = ref.micro.nutrition.restDay;
    this.panel.set('recovery');
    this.say(
      `🛋 ${DAY_LABELS[today]} — dzień bez siłowni. ` +
        (cardio.length ? `Cardio: ${cardio.map((c) => `${escapeHtml(c.type)} ${c.minutes} min ${c.zone ?? ''}`).join(', ')}. ` : '') +
        `Kroki: <strong>${ref.micro.recovery.steps}</strong>, sen: <strong>${ref.micro.recovery.sleepH} h</strong>, ` +
        `kcal dnia wolnego: <strong>${n.kcal}</strong>${carbs ? ' (high-carb!)' : ''}.`,
    );
  }

  private cmdWeek(args: string): void {
    const n = Number(/\d+/.exec(args)?.[0] ?? this.store.head());
    if (!this.store.weeks().some((w) => w.micro.week === n)) {
      this.fail(`Nie ma tygodnia ${n}. Plan ma tygodnie 1–${this.store.weeks().length}.`);
      return;
    }
    this.selectWeek(n);
  }

  private cmdMeso(args: string): void {
    const q = normalize(args);
    const metas = this.store.weeks().map((w) => w.meso);
    const meso = q
      ? metas.find((m) => normalize(m.name).includes(q) || normalize(m.focus).includes(q) || normalize(FOCUS_LABELS[m.focus]).includes(q))
      : this.store.currentRef()?.meso;
    if (!meso) {
      this.fail(`Nie znam mezocyklu „${escapeHtml(args)}". Dostępne: ${[...new Set(metas.map((m) => m.name))].map(escapeHtml).join(', ')}.`);
      return;
    }
    this.store.highlight.set(meso.id);
    const weeks = meso.microcycles.map((w) => w.week);
    this.show('macro', `🌿 <strong>${escapeHtml(meso.name)}</strong> (${FOCUS_LABELS[meso.focus]}) · W${weeks[0]}–W${weeks[weeks.length - 1]} · ` + `kcal ${meso.kcalAdjust >= 0 ? '+' : ''}${meso.kcalAdjust} · sen ${meso.sleepTargetH} h. ${escapeHtml(meso.notes ?? '')}`);
  }

  private cmdDiet(): void {
    const ref = this.store.currentRef();
    if (!ref) return;
    const { trainingDay: t, restDay: r, highCarbDays } = ref.micro.nutrition;
    this.show(
      'diet',
      `🍽 W${ref.micro.week}: trening <strong>${t.kcal} kcal</strong> (B ${t.protein} / W ${t.carbs} / T ${t.fat}), ` +
        `wolne <strong>${r.kcal} kcal</strong> (W ${r.carbs}). High-carb: ${highCarbDays.map((d) => DAY_LABELS[d]).join(', ') || '—'}. ` +
        escapeHtml(ref.meso.carbStrategy),
    );
  }

  private cmdCaffeine(): void {
    const c = this.store.plan()?.nutrition.caffeine;
    if (!c) {
      this.show('diet', 'Plan nie ma strategii kofeiny — dopisz ją w korekcie AI (nutrition.caffeine).', 'warning');
      return;
    }
    const bedtime = this.profile().pora_treningu === 'wieczor' ? ' Trenujesz wieczorem — pilnuj godziny granicznej.' : '';
    this.show(
      'diet',
      `☕ Przed treningiem <strong>${c.preWorkoutMg} mg</strong> (${c.minutesBefore} min wcześniej) · limit <strong>${c.dailyMaxMg} mg/dzień</strong> · ` +
        `ostatnia ≥ ${c.cutoffHoursBeforeSleep} h przed snem.${bedtime}` +
        (c.skipWhen?.length ? ` Pomiń / zmniejsz: ${c.skipWhen.map(escapeHtml).join('; ')}.` : ''),
    );
  }

  private cmdTips(args: string): void {
    const tips = this.store.plan()?.nutrition.tips ?? [];
    const q = normalize(args);
    const hits = q ? tips.filter((t) => normalize(t.category).startsWith(q) || normalize(t.title).includes(q)) : tips;
    this.tipFilter.set(q || null);
    this.show('tips', hits.length ? `🥗 Porady: ${hits.length}${q ? ` (${escapeHtml(args)})` : ''}.` : 'Brak porad w planie — dopisz je w korekcie AI (nutrition.tips).', hits.length ? 'info' : 'warning');
  }

  private cmdRecovery(): void {
    const ref = this.store.currentRef();
    if (!ref) return;
    const rec = ref.micro.recovery;
    const now = this.profile().sen_godz;
    this.show(
      'recovery',
      `😴 W${ref.micro.week}: sen <strong>${rec.sleepH} h</strong>${now ? ` (teraz ${now} h${now < rec.sleepH ? ` → +${Math.round((rec.sleepH - now) * 60)} min` : ''})` : ''}, ` +
        `kroki <strong>${rec.steps}</strong>. ${escapeHtml(rec.notes ?? '')}`,
    );
  }

  private cmdCardio(): void {
    const ref = this.store.currentRef();
    if (!ref) return;
    const list = ref.micro.cardio;
    this.show('cardio', list.length ? `🚴 W${ref.micro.week}: ` + list.map((c) => `${DAY_LABELS[c.day]} — ${escapeHtml(c.type)} ${c.minutes} min ${c.zone ?? ''}`).join(' · ') : `W${ref.micro.week}: brak cardio w planie.`);
  }

  private cmdDeload(): void {
    const from = this.store.current();
    const next = this.store.weeks().find((w) => w.micro.week >= from && (w.micro.isDeload || w.meso.focus === 'deload'));
    if (!next) {
      this.say('Brak kolejnego deloadu w planie' + (this.store.weeks().some((w) => w.meso.focus === 'taper') ? ' — przed startem jest taper.' : '.'), 'warning');
      return;
    }
    const inWeeks = next.micro.week - this.store.head();
    this.store.selectedWeek.set(next.micro.week);
    this.show('week', `◐ Deload: <strong>W${next.micro.week}</strong>${inWeeks > 0 ? ` (za ${inWeeks} tyg.)` : inWeeks === 0 ? ' (ten tydzień)' : ''} · objętość ${Math.round(next.micro.volumeIndex * 100)}%.`);
  }

  private cmdLoads(args: string): void {
    const lift = LIFT_ALIASES[normalize(args).split(' ')[0]] as LiftKey | undefined;
    if (args.trim() && !lift) {
      this.fail('Bój: squat / bench / deadlift / ohp (albo przysiad / wyciskanie / martwy).');
      return;
    }
    if (lift) {
      const max = this.maxFor(lift);
      if (!max) {
        this.fail(`Brak e1RM dla ${lift} — uzupełnij profil albo <strong>zaloguj ${lift} 100x5@8</strong>.`);
        return;
      }
      const injury = (this.profile().kontuzje ?? []).find((k) => (AREA_LIFTS[k.obszar] ?? []).includes(lift));
      if (injury && isSevere(injury)) {
        this.show(
          'loads',
          `<strong>${escapeHtml(injury.nazwa)}</strong> (ból ${injury.bol ?? '?'}/10${injury.diagnoza ? `, ${escapeHtml(injury.diagnoza)}` : ''}) obciąża ${lift}. ` +
            'Nie podaję ciężarów z e1RM — obciążenie ustala plan z AI (injuryNote) i fizjoterapeuta.',
          'warning',
        );
        return;
      }
      const step = this.plateStep();
      const rows = [1, 3, 5, 8].map((reps) => `${String(reps).padStart(2)} powt: ` + [3, 2, 1, 0].map((rir) => `RIR ${rir} ${suggestLoad(max, { reps, rir }, step)}`).join(' · '));
      this.show(
        'loads',
        (injury ? `Kontuzja <strong>${escapeHtml(injury.nazwa)}</strong> ${injury.bol ?? '?'}/10 — tabela jej NIE uwzględnia, trzymaj się planu z AI.<br>` : '') +
          `🧮 <strong>${lift}</strong> e1RM ${max} kg · tabela RTS · talerze ${step} kg<br>` +
          rows.map((r) => `<span class="font-mono whitespace-pre">${r}</span>`).join('<br>'),
        injury ? 'warning' : 'info',
      );
      return;
    }
    const s = this.activeSession();
    if (!s) return;
    this.store.openSession.set(s.key);
    this.show('loads', `🧮 Ciężary — <strong>${escapeHtml(s.session.name)}</strong> (W${s.week} ${DAY_LABELS[s.session.day]}). Źródło: ostatni log albo profil.`);
  }

  private cmdLog(args: string): void {
    const m = /^(\S+)\s+(.+)$/.exec(args.trim());
    const lift = m ? LIFT_ALIASES[normalize(m[1])] : undefined;
    const set = m ? parseLift(m[2]) : null;
    if (!lift || !set) {
      this.fail('Format: <strong>zaloguj squat 180x3@8</strong> (bój, ciężar x powtórzenia @RPE).');
      return;
    }
    const max = e1rm(set);
    const prev = this.maxFor(lift);
    this.store.addLog({ at: new Date().toISOString(), week: this.store.current(), lift, ...set, e1rm: max });
    const diff = prev && max ? max - prev : 0;
    this.show('log', `${lift} ${formatLift(set)} → e1RM <strong>${max} kg</strong>${diff ? ` (${diff > 0 ? '+' : ''}${diff} kg)` : ''}. <strong>sugeruj ciezary</strong> użyje nowej wartości.`, 'success');
  }

  private cmdStatus(status: 'done' | 'skipped'): void {
    const s = this.activeSession();
    if (!s) return;
    this.store.setStatus(s.key, status);
    this.store.openSession.set(null);
    const next = this.nextSession();
    this.say(`${status === 'done' ? 'Zrobione' : '⤼ Pominięte'}: ${escapeHtml(s.session.name)} (W${s.week}). ` + (next ? `Następny: <strong>${escapeHtml(next.session.name)}</strong> — ${DAY_LABELS[next.session.day]} W${next.week}.` : 'To była ostatnia sesja.'), 'success');
  }

  private cmdSwap(args: string): void {
    const m = /^(.+?)\s+na\s+(.+)$/i.exec(args.trim());
    const s = this.activeSession();
    if (!m || !s) {
      this.fail('Format: <strong>zamien przysiad na przysiad z pauzą</strong>.');
      return;
    }
    const q = normalize(m[1]);
    let hit = '';
    const swap = (list: ExerciseBlock[]) =>
      list.map((b) => {
        if (hit || !normalize(b.exercise).includes(q)) return b;
        hit = b.exercise;
        return { ...b, exercise: m[2].trim(), notes: [b.notes, `zamiast: ${b.exercise}`].filter(Boolean).join(' · ') };
      });
    const session = { ...s.session, main: swap(s.session.main), accessories: swap(s.session.accessories) };
    if (!hit) {
      this.fail(`Nie ma ćwiczenia „${escapeHtml(m[1])}" w sesji ${escapeHtml(s.session.name)}.`);
      return;
    }
    this.store.editSession(s.key, session);
    this.store.openSession.set(s.key);
    this.say(`⇄ ${escapeHtml(hit)} → <strong>${escapeHtml(m[2].trim())}</strong> (W${s.week} ${DAY_LABELS[s.session.day]}).`, 'success');
  }

  private cmdModify(): void {
    const s = this.activeSession();
    if (!s) return;
    this.store.openSession.set(s.key);
    this.mode.set('modify');
    this.panel.set('loads');
    this.say(
      `✎ Edycja: <strong>${escapeHtml(s.session.name)}</strong>. Wpisz <strong>2 4x5@8</strong> (nr ćwiczenia, serie x powt. @RPE / %75 / 120kg), ` +
        '<strong>2 usun</strong>, <strong>+ wiosłowanie 3x10@8</strong> albo <strong>gotowe</strong>.',
    );
  }

  private modify(text: string): void {
    const s = this.activeSession();
    if (!s) {
      this.mode.set('command');
      return;
    }
    const v = normalize(text);
    if (['gotowe', 'koniec', 'ok', 'done'].includes(v)) {
      this.mode.set('command');
      this.say('Zapisano zmiany sesji.', 'success');
      return;
    }
    const blocks = [...s.session.main, ...s.session.accessories];
    const nMain = s.session.main.length;
    const write = (list: ExerciseBlock[]) => {
      this.store.editSession(s.key, { ...s.session, main: list.slice(0, nMain), accessories: list.slice(nMain) });
    };
    const add = /^\+\s*(.+?)\s+(\d+)\s*x\s*([\d-]+)\s*(.*)$/i.exec(text);
    if (add) {
      const spec = parseSpec(add[4]);
      if (!spec) {
        this.fail('Po schemacie: <strong>rir2</strong> / <strong>@8</strong>, <strong>%75</strong>, <strong>120kg</strong>, tempo <strong>30X1</strong>.');
        return;
      }
      const block: ExerciseBlock = {
        exercise: add[1],
        sets: Number(add[2]),
        reps: add[3],
        rir: spec.rir ?? 2,
        tempo: spec.tempo ?? '2010',
        load: spec.load ?? { method: 'rts', note: 'dodane ręcznie' },
        priority: 2,
      };
      this.store.editSession(s.key, { ...s.session, accessories: [...s.session.accessories, block] });
      this.say(`+ ${escapeHtml(add[1])}: ${this.loadRow(block).set}. Dalej albo <strong>gotowe</strong>.`, 'success');
      return;
    }
    const m = /^(\d+)\s+(.+)$/.exec(text.trim());
    const i = m ? Number(m[1]) - 1 : -1;
    if (!m || !blocks[i]) {
      this.fail(`Podaj numer ćwiczenia 1–${blocks.length}, np. <strong>1 5x3 rir2 20X1</strong>, albo <strong>gotowe</strong>.`);
      return;
    }
    if (/^(usun|usuń|del|-)$/i.test(m[2].trim())) {
      write(blocks.filter((_, j) => j !== i));
      this.say(`− Usunięto: ${escapeHtml(blocks[i].exercise)}.`, 'success');
      return;
    }
    // „4x5 rir2 20X1", „rir1", „30X1", „%75", „120kg" — brakujące części zostają z planu.
    const scheme = /^(?:(\d+)\s*x\s*([\d-]+))?\s*(.*)$/i.exec(m[2].trim())!;
    const spec = parseSpec(scheme[3]);
    if (!spec || (!scheme[1] && !scheme[3].trim())) {
      this.fail('Schemat: <strong>serie x powtórzenia</strong> + opcjonalnie <strong>rir2</strong> / @8, <strong>%75</strong>, <strong>120kg</strong>, tempo <strong>20X1</strong>.');
      return;
    }
    const b = blocks[i];
    const updated: ExerciseBlock = {
      ...b,
      sets: scheme[1] ? Number(scheme[1]) : b.sets,
      reps: scheme[2] ?? b.reps,
      rir: spec.rir ?? b.rir,
      tempo: spec.tempo ?? b.tempo,
      load: spec.load ? { ...spec.load, adjustPct: b.load.adjustPct, maxKg: b.load.maxKg } : b.load,
    };
    write(blocks.map((x, j) => (j === i ? updated : x)));
    this.say(`✎ ${escapeHtml(b.exercise)}: ${this.loadRow(updated).set}. Dalej albo <strong>gotowe</strong>.`, 'success');
  }

  private cmdMove(args: string): void {
    const days = normalize(args).split(/[\s→>-]+/).map(toDay).filter(Boolean) as DayCode[];
    const ref = this.store.currentRef();
    if (!ref || !days.length) {
      this.fail('Format: <strong>przesun pt so</strong> (z dnia na dzień) albo <strong>przesun so</strong> dla otwartej sesji.');
      return;
    }
    const [from, to] = days.length === 1 ? [this.activeSession()?.session.day, days[0]] : days;
    const index = ref.micro.sessions.findIndex((s) => s.day === from);
    if (index === -1 || !to) {
      this.fail(`W tygodniu ${ref.micro.week} nie ma sesji w dniu ${from ? DAY_LABELS[from] : '?'}.`);
      return;
    }
    if (ref.micro.sessions.some((s) => s.day === to)) {
      this.say(`W ${DAY_LABELS[to]} jest już sesja — będą dwie tego dnia.`, 'warning');
    }
    const s = ref.micro.sessions[index];
    this.store.editSession(sessionKey(ref.micro.week, s, index), { ...s, day: to, notes: [s.notes, `przeniesiono z: ${DAY_LABELS[s.day]}`].filter(Boolean).join(' · ') });
    this.say(`↦ ${escapeHtml(s.name)}: ${DAY_LABELS[s.day]} → <strong>${DAY_LABELS[to]}</strong> (W${ref.micro.week}).`, 'success');
  }

  private cmdShorten(args: string): void {
    const target = Number(/\d+/.exec(args)?.[0]);
    const s = this.activeSession();
    if (!target || !s) {
      this.fail('Podaj czas w minutach: <strong>krocej 45</strong>.');
      return;
    }
    const acc = [...s.session.accessories];
    let duration = s.session.durationMin;
    const cut: string[] = [];
    // Najpierw najniższy priorytet (3), od końca listy.
    for (const p of [3, 2]) {
      for (let i = acc.length - 1; i >= 0 && duration > target; i--) {
        if ((acc[i].priority ?? 2) !== p) continue;
        duration -= Math.round(acc[i].sets * ((acc[i].restSec ?? 90) / 60 + 0.75));
        cut.push(acc[i].exercise);
        acc.splice(i, 1);
      }
    }
    duration = Math.max(duration, Math.min(target, s.session.durationMin));
    this.store.editSession(s.key, { ...s.session, accessories: acc, durationMin: duration });
    this.store.openSession.set(s.key);
    this.say(
      cut.length
        ? `✂ ${escapeHtml(s.session.name)}: ${s.session.durationMin} → <strong>${duration} min</strong>. Wycięto: ${cut.map(escapeHtml).join(', ')}.` + (duration > target ? ' Dalsze skracanie = mniej serii bojów (<strong>modyfikuj</strong>).' : '')
        : `Sesja ma tylko kluczowe ćwiczenia — skróć serie przez <strong>modyfikuj</strong>.`,
      cut.length ? 'success' : 'warning',
    );
  }

  private cmdInjury(args: string): void {
    const m = /^(.+?)\s*(\d+)?$/.exec(args.trim());
    if (!m || !m[1]) {
      this.fail('Format: <strong>kontuzja kolano 6</strong> (obszar, ból 0–10).');
      return;
    }
    const area = m[1];
    const pain = m[2] ? Number(m[2]) : null;
    this.store.addEvent('kontuzja', pain === null ? 2 : pain >= 7 ? 3 : pain >= 4 ? 2 : 1, `${area}${pain !== null ? ` ${pain}/10` : ''}`);
    const keys = AREA_KEYWORDS[guessEntry('obszar', area)?.value ?? normalize(area).split(' ')[0]] ?? [];
    const affected = this.store
      .weeks()
      .filter((w) => w.micro.week >= this.store.current())
      .flatMap((w) => w.micro.sessions.filter((s) => [...s.main, ...s.accessories].some((b) => keys.some((k) => normalize(b.exercise).includes(k)))).map((s) => `W${w.micro.week} ${s.day}`));
    this.say(
      `Zapisano zgłoszenie: <strong>${escapeHtml(area)}</strong>${pain !== null ? ` ${pain}/10` : ''}. ` +
        (affected.length ? `Do przejrzenia ${affected.length} sesji (${affected.slice(0, 6).join(', ')}${affected.length > 6 ? '…' : ''}). ` : '') +
        (pain !== null && pain >= 7 ? '<strong>Ból ≥ 7 — przerwij obciążanie i skonsultuj z fizjoterapeutą.</strong> ' : '') +
        this.verdictHtml(),
      'warning',
    );
  }

  /* ---------- Zdarzenia i logi dzienne ---------- */

  /** `zglos choroba 2 przeziębienie` — typ, nasilenie 1–3 (domyślnie 2), opis. */
  private cmdReport(args: string): void {
    const m = /^(\S+)\s*([123])?\s*(.*)$/.exec(args.trim());
    const type = m ? eventType(m[1]) : null;
    if (!m || !type) {
      this.fail(
        'Format: <strong>zglos &lt;typ&gt; [1–3] [opis]</strong>. Typy: ' +
          Object.entries(EVENT_TYPES).map(([k, d]) => `<strong>${k}</strong> (${escapeHtml(d.label.toLowerCase())})`).join(', ') + '.',
      );
      return;
    }
    const severity = Number(m[2] ?? 2) as 1 | 2 | 3;
    this.store.addEvent(type, severity, m[3]);
    this.show('events', `Zgłoszono: <strong>${escapeHtml(EVENT_TYPES[type].label)}</strong> · nasilenie ${severity} (${escapeHtml(EVENT_TYPES[type].severity[severity - 1])}). ` + this.verdictHtml(), this.assessment().verdict === 'regen' ? 'warning' : 'success');
  }

  private cmdAssess(): void {
    const a = this.assessment();
    this.show(
      'events',
      `📈 Wynik zdarzeń <strong>${a.score}</strong> — ${VERDICT_LABELS[a.verdict]}` +
        (a.daysSinceRegen !== null ? ` · ostatnie przegenerowanie ${a.daysSinceRegen} dni temu` : '') +
        (a.churn.length ? `<br>${a.churn.map(escapeHtml).join('<br>')}` : ''),
      a.verdict === 'regen' ? 'warning' : 'info',
    );
  }

  /** `makro 2600 180 300 70` — kcal, białko, węgle, tłuszcz (g). */
  private logMacros(args: string): void {
    const n = numbers(args);
    if (n.length !== 4) {
      this.fail('Format: <strong>makro 2600 180 300 70</strong> (kcal, białko, węglowodany, tłuszcz).');
      return;
    }
    const [kcal, protein, carbs, fat] = n;
    this.store.logDay({ makro: { kcal, protein, carbs, fat } });
    const st = this.stats().makro;
    this.show('log', `Zapisano makro: ${kcal} kcal (B ${protein} / W ${carbs} / T ${fat}).` + (st ? ` Średnia ${st.logged} dni: ${st.kcal} kcal (${st.adherencePct}% celu).` : ''), 'success');
  }

  /** `waga 85.2` — poranna masa; odchylenie trendu od planu → automatyczne zdarzenie. */
  private logWeight(args: string): void {
    const kg = numbers(args)[0];
    if (!kg || kg < 30 || kg > 300) {
      this.fail('Format: <strong>waga 85.2</strong> (kg, rano na czczo).');
      return;
    }
    this.store.logDay({ waga: kg });
    const w = this.stats().waga;
    let extra = '';
    if (w && w.trendKgPerWeek !== null && w.plannedKgPerWeek !== null) {
      const bw = this.profile().masa_kg ?? kg;
      const devPct = (Math.abs(w.trendKgPerWeek - w.plannedKgPerWeek) / bw) * 100;
      const severity = devPct >= 1.5 ? 3 : devPct >= 1 ? 2 : devPct >= 0.5 ? 1 : 0;
      const recentAuto = this.store.events().some((e) => e.type === 'waga' && e.auto && Date.now() - Date.parse(e.at) < 7 * 864e5);
      if (severity && !recentAuto) {
        this.store.addEvent('waga', severity as 1 | 2 | 3, `trend ${w.trendKgPerWeek} kg/tydz. vs plan ${w.plannedKgPerWeek}`, true);
        extra = ` Trend odbiega od planu — dodano zdarzenie. ${this.verdictHtml()}`;
      }
    }
    this.show('log', `Zapisano masę ${kg} kg.` + (w ? ` Średnia 7 dni ${w.avg7} kg, trend ${w.trendKgPerWeek ?? '?'} kg/tydz. (plan ${w.plannedKgPerWeek ?? '?'}).` : '') + extra, extra ? 'warning' : 'success');
  }

  /** `sen 6.5 7` — godziny, jakość 1–10; deficyt ≥ 1 h od celu tygodnia → zdarzenie „sen". */
  private logSleep(args: string): void {
    const [h, q] = numbers(args);
    if (!h || h > 16) {
      this.fail('Format: <strong>sen 6.5 7</strong> (godziny, opcjonalnie jakość 1–10).');
      return;
    }
    this.store.logDay({ sen: { h, q: q ?? null } });
    const target = this.store.weeks().find((w) => w.micro.week === this.store.head())?.micro.recovery.sleepH ?? 8;
    const deficit = target - h;
    let extra = '';
    if (deficit >= 1) {
      this.store.addEvent('sen', Math.min(3, Math.floor(deficit)) as 1 | 2 | 3, `${h} h (cel ${target} h)`, true);
      extra = ` Deficyt ${deficit.toFixed(1)} h — dodano zdarzenie. ${this.verdictHtml()}`;
    }
    this.show('log', `Zapisano sen: ${h} h${q ? `, jakość ${q}/10` : ''}.` + extra, extra ? 'warning' : 'success');
  }

  /** `cardio 40 z2 142` — minuty, strefa, średnie tętno. */
  private logCardio(args: string): void {
    const minutes = numbers(args)[0];
    const zone = /z([1-5])/i.exec(args)?.[1];
    const hr = numbers(args.replace(/z[1-5]/i, ''))[1] ?? null;
    if (!minutes) {
      this.fail('Format: <strong>cardio 40 z2 142</strong> (minuty, strefa Z1–Z5, średnie tętno).');
      return;
    }
    this.store.logDay({ cardio: [{ minutes, zone: zone ? `Z${zone}` : null, hr }] });
    const z = this.zones().find((x) => x.zone === `Z${zone}`);
    const off = z && hr && (hr < z.min - 3 || hr > z.max + 3) ? ` Tętno ${hr} poza ${z.zone} (${z.min}–${z.max}).` : '';
    this.show('log', `Zapisano cardio: ${minutes} min${zone ? ` Z${zone}` : ''}${hr ? ` @ ${hr} bpm` : ''}.${off}`, off ? 'warning' : 'success');
  }

  /** Jedno zdanie o stanie planu po zgłoszeniu. */
  private verdictHtml(): string {
    const a = this.assessment();
    if (a.verdict === 'regen') {
      return `<strong>Wynik ${a.score} — sugeruję przegenerowanie:</strong> <strong>prompt korekta</strong> → AI → <strong>importuj</strong>.` + (a.churn.length ? ` Uwaga: ${escapeHtml(a.churn[0])}` : '');
    }
    return `Wynik zdarzeń ${a.score} — ${VERDICT_LABELS[a.verdict]}.`;
  }

  private cmdPrompt(): void {
    const text = buildPlanPrompt(this.cfg.flow, this.profile(), this.dict);
    copyText(text).then((ok) => (ok ? this.say(`📋 Skopiowano prompt startowy (${text.length} znaków). Odpowiedź AI wklej przez <strong>importuj</strong>.`, 'success') : this.fail('Nie udało się skopiować do schowka.')));
  }

  private cmdCorrection(): void {
    const plan = this.store.plan();
    if (!plan) return;
    const from = this.store.current();
    const logs = this.store.log().map((l) => `W${l.week} ${l.lift} ${formatLift(l)} (e1RM ${l.e1rm})`);
    const status = Object.entries(this.store.state().status).map(([k, v]) => `${k}: ${v === 'done' ? 'wykonano' : 'pominięto'}`);
    const a = this.assessment();
    const events = a.items.map(
      (i) => `W${i.event.week} ${i.event.at.slice(0, 10)} · ${EVENT_TYPES[i.event.type].label} · nasilenie ${i.event.severity}${i.event.note ? ` · ${i.event.note}` : ''} · punkty ${i.points}${i.continuity ? ' (kilka dni z rzędu)' : ''}`,
    );
    const stats = statsText(this.stats(), this.zones());
    const text = buildCorrectionPrompt(this.cfg.flow, this.profile(), this.dict, plan, {
      fromWeek: from,
      logs: [...status, ...logs],
      events: [`Wynik zdarzeń: ${a.score} (${VERDICT_LABELS[a.verdict]})`, ...events],
      stats,
    });
    copyText(text).then((ok) =>
      ok
        ? this.say(
            `📋 Skopiowano prompt korekty od W${from} (${logs.length} serii, ${events.length} zdarzeń, statystyki ${this.stats().days} dni). Odpowiedź wklej przez <strong>importuj</strong>.` +
              (a.churn.length ? `<br>${a.churn.map(escapeHtml).join('<br>')}` : ''),
            a.churn.length ? 'warning' : 'success',
          )
        : this.fail('Nie udało się skopiować do schowka.'),
    );
  }

  private cmdExport(): void {
    const plan = this.store.plan();
    if (!plan) return;
    downloadJson(`plan-${normalize(plan.meta.athlete).replace(/\s+/g, '-') || 'zawodnik'}.json`, plan);
    this.say('⬇ Pobrano plan (JSON) — możesz przesłać go podopiecznemu.', 'success');
  }

  private cmdRevert(): void {
    const n = this.store.history().length;
    if (!n || !this.store.revert(n - 1)) {
      this.fail('Brak wcześniejszych wersji planu.');
      return;
    }
    this.show('week', `↶ Przywrócono poprzednią wersję planu (zostało ${n - 1} w historii).`, 'success');
  }

  private cmdDemo(): void {
    const p = this.profile();
    if (!p.cel_glowny) {
      this.fail('Najpierw wypełnij profil (zakładka Intake) — albo tam <strong>⌘K → fake pl</strong>.');
      return;
    }
    this.store.setPlan(buildDemoPlan(p), 'Demo');
    this.show('macro', `🧪 Wygenerowano plan demonstracyjny dla <strong>${escapeHtml(p.imie || 'zawodnika')}</strong> (${this.store.weeks().length} tyg.). Docelowo: <strong>prompt</strong> → AI → <strong>importuj</strong>.`, 'success');
  }

  /* ============================================================
   *  Pomocnicze
   * ============================================================ */

  nextSession(): SessionRef | null {
    const status = this.store.state().status;
    for (const ref of this.store.weeks()) {
      if (ref.micro.week < this.store.head()) continue;
      const sorted = ref.micro.sessions.map((s, i) => ({ s, i })).sort((a, b) => DAY_ORDER[a.s.day] - DAY_ORDER[b.s.day]);
      for (const { s, i } of sorted) {
        const key = sessionKey(ref.micro.week, s, i);
        if (!status[key]) return { key, week: ref.micro.week, index: i, session: s, ref };
      }
    }
    return null;
  }

  sessionByKey(key: string): SessionRef | null {
    const m = /^w(\d+)-\w+-(\d+)$/.exec(key);
    if (!m) return null;
    const ref = this.store.weeks().find((w) => w.micro.week === Number(m[1]));
    const session = ref?.micro.sessions[Number(m[2])];
    return ref && session ? { key, week: ref.micro.week, index: Number(m[2]), session, ref } : null;
  }

  /** e1RM boju: ostatni log → profil. */
  maxFor(lift: LiftKey): number | null {
    const p = this.profile();
    const fromProfile = lift === 'ohp' ? e1rm(p.ohp || null) : p[`e1rm_${lift}`];
    return this.store.latestE1rm(lift) ?? fromProfile ?? null;
  }

  /** Wykonuje decyzję AI o ciężarze (resolveLoad) i pilnuje kontuzji z profilu. */
  loadRow(b: ExerciseBlock): LoadRow {
    const max = b.lift ? this.maxFor(b.lift) : null;
    const r = resolveLoad(b, max, this.plateStep());
    const injury = injuryFor(b, this.profile().kontuzje ?? []);
    const missingDecision = injury && !hasInjuryDecision(b);
    return {
      exercise: b.exercise,
      set: formatSet(b, r),
      kg: r.kg,
      rir: r.rir,
      tempo: b.tempo ?? null,
      method: methodLabel(b),
      note: b.load.note ?? null,
      injury: b.injuryNote ?? null,
      warning: missingDecision
        ? `kontuzja „${injury.nazwa}" — plan nie ma decyzji AI${isSevere(injury) ? '; poważna: nie obciążaj bez fizjo' : ''}`
        : r.warning,
      basis: b.load.method === 'kg' ? 'kg z planu' : max ? `e1RM ${b.lift} ${max}${r.capped ? ' · limit' : ''}` : (r.warning ?? 'ciężar na RIR'),
    };
  }

  private weekSummary(ref: WeekRef): string {
    const m = ref.micro;
    return (
      `📅 <strong>W${m.week}</strong> · ${escapeHtml(ref.meso.name)} (${FOCUS_LABELS[ref.meso.focus]})${m.isDeload ? ' · <strong>deload</strong>' : ''} · ` +
      `${m.sessions.length} sesji · kcal ${m.nutrition.trainingDay.kcal}/${m.nutrition.restDay.kcal} · sen ${m.recovery.sleepH} h · kroki ${m.recovery.steps}`
    );
  }

  private show(panel: PlanPanel, html: string, type: PlanEcho['type'] = 'info'): void {
    this.panel.set(panel);
    this.say(html, type);
  }

  private say(html: string, type: PlanEcho['type'] = 'info'): void {
    this.echo.set({ html, type });
  }

  private fail(html: string): void {
    this.errorTick.update((n) => n + 1);
    this.say(html, 'error');
  }
}

/** Najdłuższa komenda / alias będąca początkiem wpisu („prompt korekta" przed „prompt"). */
export function matchCommand(text: string): { cmd: PlanCommandDef | null; args: string } {
  const v = normalize(text);
  let best: { cmd: PlanCommandDef; len: number } | null = null;
  for (const c of PLAN_COMMANDS) {
    for (const name of [c.cmd, ...(c.aliases ?? [])].map(normalize)) {
      if ((v === name || v.startsWith(name + ' ')) && (!best || name.length > best.len)) best = { cmd: c, len: name.length };
    }
  }
  if (!best) return { cmd: null, args: '' };
  // Argumenty z oryginalnego tekstu (z polskimi znakami): obetnij tyle słów, ile ma komenda.
  const words = text.trim().split(/\s+/);
  const cmdWords = normalize(text).slice(0, best.len).split(' ').length;
  return { cmd: best.cmd, args: words.slice(cmdWords).join(' ') };
}

function numbers(raw: string): number[] {
  return (raw.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function eventType(token: string): EventType | null {
  const t = normalize(token);
  return (
    (Object.keys(EVENT_TYPES) as EventType[]).find(
      (k) => k === t || normalize(EVENT_TYPES[k].label).startsWith(t) || (EVENT_TYPES[k].aliases ?? []).some((a) => normalize(a) === t),
    ) ?? null
  );
}

/** Części serii w `modyfikuj`: rir2 / @8 (RPE) · %75 · 120kg · tempo 20X1. null = nieznany token. */
export function parseSpec(raw: string): { rir?: number; tempo?: string; load?: ExerciseBlock['load'] } | null {
  const out: { rir?: number; tempo?: string; load?: ExerciseBlock['load'] } = {};
  for (const tok of raw.trim().toLowerCase().replace(/,/g, '.').replace(/rir\s+/g, 'rir').replace(/@\s+/g, '@').split(/\s+/).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^rir(\d+(?:\.5)?)$/.exec(tok))) out.rir = Number(m[1]);
    else if ((m = /^@(\d+(?:\.5)?)$/.exec(tok))) {
      out.rir = Math.max(0, 10 - Number(m[1]));
      out.load = { method: 'rts', note: 'zmienione ręcznie' };
    } else if ((m = /^%(\d+)$|^(\d+)%$/.exec(tok))) out.load = { method: 'pct', value: Number(m[1] ?? m[2]), note: 'zmienione ręcznie' };
    else if ((m = /^(\d+(?:\.\d+)?)kg$/.exec(tok))) out.load = { method: 'kg', value: Number(m[1]), note: 'zmienione ręcznie' };
    else if (/^[0-9x]{4}$/.test(tok)) out.tempo = tok.toUpperCase();
    else return null;
  }
  return out;
}

function toDay(token: string): DayCode | null {
  const t = normalize(token);
  if (!t) return null;
  return DAY_CODES.find((d) => d === t || normalize(DAY_LABELS[d]).startsWith(t) || (t === 'sb' && d === 'so') || (t === 'czw' && d === 'cz')) ?? null;
}
