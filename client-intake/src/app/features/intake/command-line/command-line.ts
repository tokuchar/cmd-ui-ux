import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { IntakeEngine } from '../../../core/engine/intake-engine';
import { FIELD_TYPES } from '../../../core/engine/field-types';
import { DictEntry } from '../../../core/engine/field-def';
import { normalize } from '../../../core/engine/text';

interface OptionRow {
  entry: DictEntry;
  /** Pierwsza pozycja słownika = najbardziej prawdopodobna. */
  first: boolean;
}

/**
 * Command line: nagłówek kroku, prompt ›, ghost-text, przyciski, dropdown opcji,
 * podpowiedzi komend i pole echo. Cała logika przepływu jest w IntakeEngine.
 */
@Component({
  selector: 'app-command-line',
  templateUrl: './command-line.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
})
export class CommandLine {
  protected readonly engine = inject(IntakeEngine);
  protected readonly s = this.engine.s;
  protected readonly prompt = this.engine.prompt;
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly shaking = signal(false);

  /**
   * Klucz bieżącego pytania (tryb + kursor + licznik). Stan dropdownu (zamknięcie Esc, podświetlenie
   * podpowiedzi) jest przypięty do klucza — przy następnym pytaniu wraca do domyślnego sam z siebie,
   * bez efektu, który mógłby nadpisać Esc naciśnięty zaraz po zmianie kroku.
   */
  private readonly promptKey = computed(
    () => `${this.s.mode()}|${JSON.stringify(this.s.cursor())}|${this.prompt().label}|${this.prompt().counter}`,
  );
  /** Esc chowa dropdown do czasu kolejnego wpisu / następnego pytania. */
  private readonly closedFor = signal<string | null>(null);
  private readonly dropdownClosed = computed(() => this.closedFor() === this.promptKey());
  private readonly suggestCursor = signal<{ key: string; i: number }>({ key: '', i: -1 });
  protected readonly suggestIndex = computed(() =>
    this.suggestCursor().key === this.promptKey() ? this.suggestCursor().i : -1,
  );

  protected readonly isCommand = computed(() => this.s.mode() === 'command');

  protected readonly suggestions = computed(() =>
    this.isCommand() && !this.dropdownClosed() ? this.engine.commandSuggestions(this.s.draft()) : [],
  );

  /** Opcje do pokazania: pełna lista, gdy pusto lub wpis = opcja; inaczej filtr po wpisie. */
  protected readonly options = computed<OptionRow[]>(() => {
    const p = this.prompt();
    if (this.isCommand() || p.disabled || !p.options.length || this.dropdownClosed()) return [];
    const rows = p.options.map((entry, i) => ({ entry, first: i === 0 }));
    const d = normalize(this.s.draft());
    if (!d || rows.some((r) => matchesExactly(r.entry, d))) return rows;
    return rows.filter((r) => matchesPartly(r.entry, d));
  });

  protected readonly activeOption = computed(() => {
    const rows = this.options();
    const d = normalize(this.s.draft());
    const exact = rows.findIndex((r) => matchesExactly(r.entry, d));
    if (exact !== -1) return exact;
    if (!d || !rows.length) return -1;
    // Wolny tekst dozwolony: podświetl tylko opcję zaczynającą się od wpisu („rodz" → Rodzina),
    // w przeciwnym razie Enter zapisze wpisany tekst.
    if (this.prompt().allowCustom) return rows.findIndex((r) => normalize(r.entry.label).startsWith(d));
    return 0;
  });

  /** Uzupełnienie Tabem: pierwsza opcja/komenda zaczynająca się od wpisu. */
  private readonly completion = computed<string | null>(() => {
    const d = this.s.draft();
    const nd = normalize(d);
    if (!nd) return null;
    const labels = this.isCommand() ? this.suggestions().map((c) => c.cmd) : this.prompt().options.map((o) => o.label);
    const hit = labels.find((l) => normalize(l).startsWith(nd) && normalize(l) !== nd);
    return hit ?? null;
  });

  /** Szary tekst za kursorem: format pola (adres, data) albo uzupełnienie. */
  protected readonly ghost = computed(() => {
    const field = this.prompt().field;
    const d = this.s.draft();
    const typeGhost = !this.isCommand() && field ? FIELD_TYPES[field.type].ghost : undefined;
    if (typeGhost && field) return typeGhost(d, field);
    const full = this.completion();
    return full ? full.slice(d.length) : '';
  });

  protected readonly echoIcon = computed(() => ECHO_ICONS[this.s.echo().type]);

  /** Czy jakiś dropdown (komendy lub opcje) jest otwarty — dla aria-expanded. */
  protected readonly dropdownOpen = computed(() => this.suggestions().length > 0 || this.options().length > 0);

  /** id listy sterowanej przez input (aria-controls). */
  protected readonly listboxId = computed(() =>
    this.suggestions().length ? 'cmd-suggestions' : this.options().length ? 'cmd-options' : null,
  );

  /** id aktywnej pozycji dropdownu (aria-activedescendant). */
  protected readonly activeDescendant = computed(() => {
    if (this.suggestions().length && this.suggestIndex() >= 0) return `cmd-sugg-${this.suggestIndex()}`;
    if (this.options().length && this.activeOption() >= 0) return `cmd-opt-${this.activeOption()}`;
    return null;
  });

  constructor() {
    effect(() => {
      if (this.s.errorTick() === 0) return;
      untracked(() => {
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 400);
      });
    });
    effect(() => {
      this.s.focusTick();
      setTimeout(() => this.applyFocus());
    });
    // Podświetlona pozycja dropdownu (↑↓) zawsze widoczna — przewiń listę do niej.
    afterRenderEffect(() => {
      this.suggestIndex();
      this.activeOption();
      this.host.nativeElement.querySelectorAll('[data-active]').forEach((el) => el.scrollIntoView({ block: 'nearest' }));
    });
    // Zmiany asynchroniczne (np. po wczytaniu osób) — wartość pola idzie za draftem.
    effect(() => {
      this.s.draft();
      this.syncInput();
    });
  }

  /**
   * Wartość inputu ustawiamy synchronicznie po każdej akcji (zamiast [value]), żeby szybkie
   * wpisywanie / skaner / wklejka + Enter nie wyprzedziły renderu i nie dokleiły tekstu
   * do wartości poprzedniego kroku.
   */
  private syncInput(): void {
    const el = this.input().nativeElement;
    const v = this.s.draft();
    if (el.value !== v) el.value = v;
  }

  private lastFocus = -1;

  /** Fokus/zaznaczenie z engine — raz na żądanie (focusTick), też synchronicznie po akcji. */
  private applyFocus(): void {
    const { n, select } = this.s.focusTick();
    if (n === this.lastFocus) return;
    this.lastFocus = n;
    const el = this.input().nativeElement;
    el.focus();
    if (select) el.select();
  }

  private afterAction(): void {
    this.syncInput();
    this.applyFocus();
  }

  protected submit(): void {
    this.engine.submit();
    this.afterAction();
  }

  protected back(): void {
    this.engine.back();
    this.afterAction();
  }

  protected approve(): void {
    this.engine.approveAll();
    this.afterAction();
  }

  /** Przełącznik trybu komend ⟷ formularz (klik — działa też na dotyku, bez klawiatury). */
  protected toggleMode(): void {
    this.engine.toggleCommandMode();
    this.afterAction();
  }

  protected onInput(value: string): void {
    this.s.draft.set(value);
    this.engine.clearError();
    this.closedFor.set(null);
    this.suggestCursor.set({ key: '', i: -1 });
  }

  protected onKeydown(e: KeyboardEvent): void {
    const suggestions = this.suggestions();
    const options = this.options();

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (this.dropdownClosed()) {
        // Lista zamknięta Esc — strzałka otwiera ją ponownie.
        e.preventDefault();
        this.closedFor.set(null);
      } else if (suggestions.length) {
        e.preventDefault();
        const i = (this.suggestIndex() + dir + suggestions.length) % suggestions.length;
        this.suggestCursor.set({ key: this.promptKey(), i });
      } else if (options.length) {
        e.preventDefault();
        const cur = this.activeOption();
        const next = cur === -1 ? (dir === 1 ? 0 : options.length - 1) : (cur + dir + options.length) % options.length;
        this.s.draft.set(options[next].entry.label);
        this.engine.clearError();
        this.syncInput();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closedFor.set(this.promptKey());
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && this.completion()) {
      e.preventDefault();
      this.s.draft.set(this.completion()!);
      this.syncInput();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && this.prompt().showApprove) {
        this.approve();
        return;
      }
      if (suggestions.length && this.suggestIndex() >= 0) {
        this.runSuggestion(suggestions[this.suggestIndex()].cmd);
        return;
      }
      const active = this.activeOption();
      if (options.length && active >= 0) this.s.draft.set(options[active].entry.label);
      this.submit();
    }
  }

  protected pickOption(entry: DictEntry): void {
    this.s.draft.set(entry.label);
    this.submit();
  }

  protected runSuggestion(cmd: string): void {
    this.s.draft.set(cmd);
    this.submit();
  }
}

function matchesExactly(e: DictEntry, d: string): boolean {
  return normalize(e.label) === d || (e.aliases ?? []).some((a) => normalize(a) === d);
}

function matchesPartly(e: DictEntry, d: string): boolean {
  return normalize(e.label).includes(d) || (e.aliases ?? []).some((a) => normalize(a).includes(d));
}

const ECHO_ICONS = {
  info: { icon: 'ℹ', cls: 'text-brand-text' },
  success: { icon: '✓', cls: 'text-success' },
  error: { icon: '✗', cls: 'text-danger' },
  warning: { icon: '⚠', cls: 'text-warning' },
};
