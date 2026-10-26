import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlanStore } from './core/plan/plan.store';
import { ThemeService } from './core/services/theme.service';
import { IntakeStore } from './core/state/intake.store';

/** Powłoka: zakładki Intake → Profil → Plan (stan postępu przy nazwie) + treść trasy. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <nav class="w-full border-b border-app-line bg-app-surface/80 backdrop-blur-sm relative z-30" aria-label="Sekcje">
      <div class="w-full max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center gap-1 h-11 overflow-x-auto">
        <span class="font-mono font-bold text-sm text-brand-text mr-3 shrink-0">idea<span class="text-app-text">Training</span></span>
        @for (t of tabs(); track t.path; let i = $index) {
          <a
            [routerLink]="t.path"
            routerLinkActive="!text-app-text bg-app-hover"
            class="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-app-muted hover:text-app-text hover:bg-app-hover transition-colors flex items-center gap-1.5"
          >
            <span class="font-mono text-[10px] opacity-60">{{ i + 1 }}</span>
            {{ t.label }}
            <span class="font-mono text-[10px]" [class]="t.done ? 'text-success' : 'text-app-muted'">{{ t.badge }}</span>
          </a>
          @if (i < 2) {
            <span class="text-app-empty-dim text-xs shrink-0" aria-hidden="true">›</span>
          }
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class App {
  private readonly intake = inject(IntakeStore);
  private readonly plan = inject(PlanStore);
  /** Motyw (klasa .dark) aktywny na każdej zakładce. */
  protected readonly theme = inject(ThemeService);

  protected readonly tabs = computed(() => {
    const pct = this.intake.totalProgress();
    const plan = this.plan.plan();
    return [
      { path: '/intake', label: 'Intake', badge: `${pct}%`, done: pct >= 100 },
      { path: '/profil', label: 'Profil', badge: pct >= 100 ? '✓' : '', done: pct >= 100 },
      { path: '/plan', label: 'Plan', badge: plan ? `${this.plan.weeks().length} tyg.` : '—', done: !!plan },
    ];
  });
}
