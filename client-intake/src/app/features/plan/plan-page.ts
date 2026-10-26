import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FOCUS_LABELS } from '../../core/models/plan.model';
import { PlanEngine } from '../../core/plan/plan-engine';
import { ThemeService } from '../../core/services/theme.service';
import { AnimatedBackground } from '../intake/animated-background/animated-background';
import { PlanConsole } from './plan-console';
import { PlanDetail } from './plan-detail';
import { PlanGraph } from './plan-graph';
import { SessionDrawer } from './session-drawer';

/**
 * Zakładka „Plan": command line (⌘K) + graf makrocyklu (git tree) + panel szczegółów + szuflada sesji.
 * Bez planu: ekran startowy z flow „Kopiuj prompt → AI → Wklej JSON".
 */
@Component({
  selector: 'app-plan-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedBackground, PlanConsole, PlanGraph, PlanDetail, SessionDrawer, RouterLink],
  host: { class: 'contents' },
  template: `
    <main class="relative flex-1 w-full">
      @if (!theme.plainBg()) {
        <app-animated-background />
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-app-bg/60 via-app-bg/45 to-app-bg/85"></div>
      }
      <div class="relative z-10 w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        @if (meta(); as m) {
          <header class="flex flex-wrap items-end justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-app-muted">
                Plan · {{ m.athlete }} · start {{ m.startDate.split('-').reverse().join('.') }}
              </p>
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight">{{ m.goal }}</h1>
            </div>
            <div class="flex gap-4 font-mono text-xs">
              <div><div class="text-[10px] text-app-muted uppercase font-bold">Tydzień</div><span class="text-lg font-bold">{{ head() }}</span><span class="text-app-muted">/{{ total() }}</span></div>
              <div><div class="text-[10px] text-app-muted uppercase font-bold">Faza</div><span class="text-sm font-semibold">{{ phase() }}</span></div>
              <div><div class="text-[10px] text-app-muted uppercase font-bold">Wykonane</div><span class="text-sm font-semibold">{{ done() }}</span></div>
              <button type="button" (click)="engine.run('stan')" class="text-left" title="Wynik zdarzeń — kiedy przegenerować plan">
                <div class="text-[10px] text-app-muted uppercase font-bold">Zdarzenia</div>
                <span class="text-sm font-semibold" [class]="verdictClass()">{{ engine.assessment().score }}{{ engine.assessment().verdict === 'regen' ? ' ↻' : '' }}</span>
              </button>
            </div>
          </header>
        }

        <app-plan-console />

        @if (engine.store.plan()) {
          <section class="bg-app-surface/90 border border-app-line rounded-2xl shadow-sm p-3 sm:p-4">
            <app-plan-graph />
          </section>
          <app-plan-detail />
        } @else if (engine.panel() === 'import') {
          <app-plan-detail />
        } @else {
          <!-- Ekran startowy: flow ręczny z AI -->
          <section class="bg-app-surface border border-app-line rounded-2xl shadow-sm p-5 sm:p-6">
            <h1 class="text-lg font-bold mb-1">Brak planu</h1>
            <p class="text-xs text-app-muted mb-5">Plan powstaje w AI na podstawie profilu, a tu go oglądasz i prowadzisz komendami.</p>
            <ol class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <li class="border border-app-line rounded-xl p-3">
                <div class="font-mono text-brand-text font-bold mb-1">1 · profil</div>
                Uzupełnij intake i sprawdź dane w zakładce Profil.
                <a routerLink="/profil" class="block mt-2 text-brand-text font-semibold hover:underline">Profil ›</a>
              </li>
              <li class="border border-app-line rounded-xl p-3">
                <div class="font-mono text-brand-text font-bold mb-1">2 · prompt → AI</div>
                Skopiuj prompt (dane + schemat JSON) i wklej do czatu z AI.
                <button type="button" (click)="engine.run('prompt')" class="block mt-2 text-brand-text font-semibold hover:underline">Kopiuj prompt ›</button>
              </li>
              <li class="border border-app-line rounded-xl p-3">
                <div class="font-mono text-brand-text font-bold mb-1">3 · wklej JSON</div>
                Odpowiedź AI wklej tutaj — walidacja na żywo.
                <button type="button" (click)="engine.run('importuj')" class="block mt-2 text-brand-text font-semibold hover:underline">Importuj ›</button>
              </li>
            </ol>
            <p class="text-[11px] text-app-muted mt-4">
              Szybki podgląd bez AI: <button type="button" (click)="engine.run('demo')" class="font-mono font-bold text-brand-text hover:underline">demo</button>
              — plan demonstracyjny z bieżącego profilu.
            </p>
          </section>
        }
      </div>
    </main>
    <app-session-drawer />
  `,
})
export class PlanPage {
  protected readonly engine = inject(PlanEngine);
  protected readonly theme = inject(ThemeService);
  private readonly console = viewChild.required(PlanConsole);

  protected readonly meta = computed(() => this.engine.store.plan()?.meta ?? null);
  protected readonly head = this.engine.store.head;
  protected readonly total = computed(() => this.engine.store.weeks().length);
  protected readonly phase = computed(() => {
    const ref = this.engine.store.weeks().find((w) => w.micro.week === this.head());
    return ref ? (ref.micro.isDeload ? 'deload' : FOCUS_LABELS[ref.meso.focus]) : '—';
  });
  protected readonly verdictClass = computed(() => {
    const v = this.engine.assessment().verdict;
    return v === 'regen' ? 'text-danger-text' : v === 'watch' ? 'text-warning' : 'text-success-text';
  });
  protected readonly done = computed(() => {
    const status = Object.values(this.engine.store.state().status);
    const all = this.engine.store.weeks().reduce((n, w) => n + w.micro.sessions.length, 0);
    return `${status.filter((s) => s === 'done').length}/${all}`;
  });

  constructor() {
    // `/plan?import=1` (przycisk „Wklej JSON z AI" w Profilu) → od razu pole importu.
    if (inject(ActivatedRoute).snapshot.queryParamMap.has('import')) {
      untracked(() => this.engine.run('importuj'));
      // Z planem pole jest pod grafem → przewiń i ustaw fokus.
      setTimeout(() => {
        const ta = document.querySelector<HTMLTextAreaElement>('app-plan-detail textarea');
        ta?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ta?.focus({ preventScroll: true });
      });
      inject(Router).navigate([], { queryParams: {}, replaceUrl: true });
    } else if (!this.engine.echo().html) {
      untracked(() =>
        this.engine.store.plan()
          ? this.engine.run('tydzien')
          : this.engine.echo.set({ html: 'Brak planu — wpisz <strong>prompt</strong>, <strong>importuj</strong> albo <strong>demo</strong>.', type: 'info' }),
      );
    }
    // `modyfikuj` (też z szuflady) → fokus na command line.
    effect(() => {
      if (this.engine.mode() === 'modify') setTimeout(() => this.console().focus());
    });
  }

  /** ⌘K / Ctrl+K — fokus na command line planu · ⌘Q motyw. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'k') {
      e.preventDefault();
      this.console().focus();
    } else if (k === 'q') {
      e.preventDefault();
      this.theme.toggle();
    }
  }
}
