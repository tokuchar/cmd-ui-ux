import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { PlanEngine } from '../../core/plan/plan-engine';

const ECHO_ICONS = {
  info: { icon: 'ℹ', cls: 'text-brand-text' },
  success: { icon: '✓', cls: 'text-success' },
  error: { icon: '✗', cls: 'text-danger' },
  warning: { icon: '⚠', cls: 'text-warning' },
};

/**
 * Command line widoku planu — wygląd 1:1 z intake (prompt ›, ghost-text, podpowiedzi, echo).
 * ↑↓ = podpowiedzi albo historia komend, Tab = uzupełnij, Enter na pustym = `nastepny`.
 */
@Component({
  selector: 'app-plan-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div
      class="relative bg-app-surface border border-app-line rounded-xl p-3 sm:p-4 shadow-sm transition-all focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent"
      [class.shake]="shaking()"
    >
      <label for="planInput" class="text-[11px] font-semibold text-app-muted uppercase tracking-wider mb-2 flex justify-between items-center gap-2">
        <span>{{ modify() ? 'Edycja sesji' : 'Komenda' }}</span>
        <span class="text-[10px] font-normal opacity-70 font-mono normal-case">{{ modify() ? 'gotowe = koniec' : 'Enter = następny trening · pomoc' }}</span>
      </label>
      <div class="relative flex items-center gap-2">
        <span class="text-xl font-bold font-mono select-none" [class]="modify() ? 'text-warning' : 'text-brand-text'">{{ modify() ? '✎' : '›' }}</span>
        <div class="relative flex-1 min-w-0">
          <div aria-hidden="true" class="pointer-events-none absolute inset-0 font-mono text-base sm:text-lg whitespace-pre overflow-hidden text-app-muted/50">
            <span class="invisible">{{ engine.draft() }}</span>{{ ghost() }}
          </div>
          <input
            #input
            id="planInput"
            type="text"
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="suggestions().length > 0"
            aria-controls="plan-suggestions"
            [placeholder]="modify() ? '1 5x3@8 · 2 usun · + wiosłowanie 3x10@8' : 'nastepny, dieta, sugeruj ciezary, zaloguj squat 180x3@8…'"
            [value]="engine.draft()"
            (input)="onInput(input.value)"
            (keydown)="onKeydown($event)"
            (focus)="focused.set(true)"
            (blur)="focused.set(false)"
            class="relative w-full bg-transparent text-base sm:text-lg font-mono focus:outline-none placeholder:text-app-muted text-app-text"
          />
        </div>
        <button type="button" (click)="submit()" class="shrink-0 px-3 py-1.5 bg-brand hover:bg-brand-hover text-on-brand text-xs font-medium rounded-md transition-all">
          {{ modify() ? 'Zapisz' : 'Wykonaj' }}
        </button>
      </div>

      @if (suggestions().length) {
        <div
          id="plan-suggestions"
          role="listbox"
          aria-label="Komendy"
          class="absolute left-0 right-0 top-full mt-2 bg-app-popover border border-app-line rounded-xl shadow-xl z-40 max-h-72 overflow-y-auto divide-y divide-app-line/50"
        >
          @for (c of suggestions(); track c.cmd; let i = $index) {
            <div
              role="option"
              [attr.aria-selected]="i === index()"
              (mousedown)="$event.preventDefault()"
              (click)="pick(c.cmd, !!c.args)"
              class="p-2.5 cursor-pointer flex justify-between items-center gap-3 text-xs font-mono transition-colors hover:bg-app-hover"
              [class.bg-app-hover]="i === index()"
            >
              <span class="shrink-0"><span class="font-bold text-brand-text">{{ c.cmd }}</span><span class="text-app-muted ml-1.5">{{ c.args }}</span></span>
              <span class="text-[11px] text-app-muted truncate">{{ c.desc }}</span>
            </div>
          }
        </div>
      }
    </div>

    <div aria-live="polite" class="bg-app-surface border border-app-line rounded-xl p-3.5 shadow-sm min-h-[52px] flex items-center">
      <div class="text-xs sm:text-sm font-mono text-app-text flex items-start gap-2 min-w-0">
        <span class="font-bold text-base select-none" [class]="icon().cls">{{ icon().icon }}</span>
        <span class="min-w-0 break-words" [innerHTML]="engine.echo().html"></span>
      </div>
    </div>
  `,
})
export class PlanConsole {
  protected readonly engine = inject(PlanEngine);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly focused = signal(false);
  protected readonly shaking = signal(false);
  protected readonly modify = computed(() => this.engine.mode() === 'modify');
  private readonly cursor = signal(-1);
  /** Lista zamknięta Esc do kolejnego wpisu. */
  private readonly closed = signal(false);

  protected readonly suggestions = computed(() => {
    const d = this.engine.draft();
    // Pusta linia: bez listy (↑ = historia, „pomoc" = wszystkie komendy).
    if (!d.trim() || !this.focused() || this.closed() || this.modify()) return [];
    // Po wpisaniu argumentów (spacja po pełnej komendzie) lista znika — zostaje ghost-text.
    const list = this.engine.suggestions(d);
    return d.includes(' ') && list.length <= 1 ? [] : list.slice(0, 12);
  });
  protected readonly index = computed(() => Math.min(this.cursor(), this.suggestions().length - 1));
  protected readonly ghost = computed(() => this.engine.ghost(this.engine.draft()));
  protected readonly icon = computed(() => ECHO_ICONS[this.engine.echo().type]);

  constructor() {
    effect(() => {
      if (this.engine.errorTick() === 0) return;
      untracked(() => {
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 400);
      });
    });
  }

  focus(text?: string): void {
    if (text !== undefined) this.setDraft(text);
    this.input().nativeElement.focus();
  }

  protected onInput(v: string): void {
    this.engine.draft.set(v);
    this.cursor.set(-1);
    this.closed.set(false);
  }

  protected onKeydown(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (list.length && this.engine.draft()) {
        this.cursor.set((this.index() + dir + list.length) % list.length);
      } else {
        // Pusta linia: historia komend jak w terminalu.
        const prev = this.engine.historyStep(dir === -1 ? -1 : 1);
        if (prev !== null) this.setDraft(prev);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.modify()) this.engine.run('gotowe');
      this.closed.set(true);
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      const full = this.index() >= 0 ? list[this.index()].cmd + (list[this.index()].args ? ' ' : '') : this.engine.completion(this.engine.draft());
      if (full) {
        e.preventDefault();
        this.setDraft(full);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.index() >= 0 && list[this.index()]) {
        const c = list[this.index()];
        this.pick(c.cmd, !!c.args);
        return;
      }
      this.submit();
    }
  }

  /** Komenda z argumentami → wstaw i czekaj na argumenty; bez → wykonaj. */
  protected pick(cmd: string, hasArgs: boolean): void {
    if (hasArgs) {
      this.setDraft(cmd + ' ');
      this.input().nativeElement.focus();
      return;
    }
    this.setDraft(cmd);
    this.submit();
  }

  protected submit(): void {
    this.engine.run(this.engine.draft());
    this.cursor.set(-1);
    this.setDraft(this.engine.draft());
    this.input().nativeElement.focus();
  }

  private setDraft(v: string): void {
    this.engine.draft.set(v);
    const el = this.input().nativeElement;
    el.value = v;
    this.cursor.set(-1);
  }
}
