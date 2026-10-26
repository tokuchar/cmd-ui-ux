import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DAY_LABELS } from '../../core/models/plan.model';
import { PlanEngine } from '../../core/plan/plan-engine';

/**
 * Szuflada sesji: rozgrzewka → prehab → bloki główne (z kg z e1RM) → akcesoria → wyciszenie.
 * Prawa kolumna na desktopie, dolny arkusz na telefonie. Esc / ✕ zamyka.
 */
@Component({
  selector: 'app-session-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    @if (s(); as ref) {
      @if (!modifying()) {
        <div class="fixed inset-0 bg-backdrop z-40" (click)="close()"></div>
      }
      <aside
        class="fixed z-50 bg-app-surface border border-app-line shadow-2xl flex flex-col
               inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl
               md:top-0 md:right-0 md:left-auto md:w-[440px] md:max-h-none md:rounded-none md:rounded-l-2xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ref.session.name"
      >
        <header class="px-4 py-3 border-b border-app-line flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-app-muted">W{{ ref.week }} · {{ day() }} · {{ ref.session.durationMin }} min</div>
            <h2 class="text-base font-semibold truncate">{{ ref.session.name }}</h2>
            @if (status()) {
              <span class="text-[11px] font-mono" [class]="status() === 'done' ? 'text-success-text' : 'text-app-muted'">{{ status() === 'done' ? '✓ wykonano' : '⤼ pominięto' }}</span>
            }
          </div>
          <button type="button" (click)="close()" aria-label="Zamknij" class="w-8 h-8 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover">✕</button>
        </header>

        <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4 text-xs">
          @if (ref.session.warmup.length) {
            <section>
              <h3 class="section-title">Rozgrzewka</h3>
              @for (d of ref.session.warmup; track $index) {
                <div class="flex justify-between gap-3 py-0.5"><span>{{ d.name }}</span><span class="font-mono text-app-muted shrink-0">{{ drill(d) }}</span></div>
              }
            </section>
          }
          @if (ref.session.prehab.length) {
            <section>
              <h3 class="section-title text-pain-mid">Prehab / rehab</h3>
              @for (d of ref.session.prehab; track $index) {
                <div class="flex justify-between gap-3 py-0.5">
                  <span>{{ d.name }} @if (d.target) {<span class="text-[10px] font-mono text-pain-mid">· {{ d.target }}</span>}</span>
                  <span class="font-mono text-app-muted shrink-0">{{ drill(d) }}</span>
                </div>
              }
            </section>
          }
          <section>
            <h3 class="section-title">Główne · akcesoria</h3>
            <ol class="flex flex-col">
              @for (row of rows(); track $index; let i = $index) {
                <li class="py-2 border-b border-app-line/50 last:border-0" [class.opacity-80]="row.accessory">
                  <div class="flex items-baseline justify-between gap-3">
                    <span class="font-medium"><span class="font-mono text-app-muted mr-1">{{ i + 1 }}</span>{{ row.load.exercise }}</span>
                    <span class="font-mono font-bold text-sm shrink-0">{{ row.load.kg !== null ? row.load.kg + ' kg' : '' }}</span>
                  </div>
                  <div class="flex justify-between gap-3 font-mono text-[11px] mt-0.5">
                    <span class="text-app-text">{{ row.load.set }}</span>
                    <span class="text-[10px] px-1.5 rounded bg-app-hover text-app-muted shrink-0" [title]="row.load.note ?? ''">{{ row.load.method }}</span>
                  </div>
                  @if (row.load.note) {
                    <div class="text-[10px] text-app-muted mt-0.5">{{ row.load.note }}</div>
                  }
                  @if (row.load.injury) {
                    <div class="text-[10px] text-pain-mid mt-0.5">🩹 {{ row.load.injury }}</div>
                  }
                  @if (row.load.warning) {
                    <div class="text-[10px] text-danger-text mt-0.5">⚠ {{ row.load.warning }}</div>
                  }
                  @if (row.block.notes) {
                    <div class="text-[10px] text-app-muted mt-0.5">{{ row.block.notes }}{{ row.block.restSec ? ' · przerwa ' + row.block.restSec / 60 + ' min' : '' }}</div>
                  } @else if (row.block.restSec) {
                    <div class="text-[10px] text-app-muted mt-0.5">przerwa {{ row.block.restSec / 60 }} min{{ row.block.priority === 3 ? ' · opcjonalne' : '' }}</div>
                  }
                </li>
              }
            </ol>
          </section>
          @if (fueling(); as f) {
            <section>
              <h3 class="section-title">Paliwo</h3>
              @if (f.caffeineMg !== undefined) {
                <div class="py-0.5">☕ Kofeina: <strong class="font-mono">{{ f.caffeineMg ? f.caffeineMg + ' mg' : 'bez' }}</strong>{{ f.caffeineMg && caffeineBefore() ? ' · ' + caffeineBefore() + ' min przed' : '' }}</div>
              }
              @if (f.pre) { <div class="py-0.5"><span class="text-app-muted">Przed:</span> {{ f.pre }}</div> }
              @if (f.intra) { <div class="py-0.5"><span class="text-app-muted">W trakcie:</span> {{ f.intra }}</div> }
              @if (f.post) { <div class="py-0.5"><span class="text-app-muted">Po:</span> {{ f.post }}</div> }
            </section>
          }
          @if (ref.session.cooldown.length) {
            <section>
              <h3 class="section-title">Wyciszenie</h3>
              @for (d of ref.session.cooldown; track $index) {
                <div class="flex justify-between gap-3 py-0.5"><span>{{ d.name }}</span><span class="font-mono text-app-muted">{{ drill(d) }}</span></div>
              }
            </section>
          }
          @if (ref.session.notes) {
            <p class="text-[11px] text-app-muted">📝 {{ ref.session.notes }}</p>
          }
        </div>

        <footer class="px-4 py-3 border-t border-app-line flex flex-wrap gap-2 justify-end">
          <button type="button" (click)="run('modyfikuj')" class="px-3 py-1.5 border border-app-line text-xs rounded-md hover:bg-app-hover">✎ Modyfikuj</button>
          <button type="button" (click)="run('pomin')" class="px-3 py-1.5 border border-app-line text-xs rounded-md text-app-muted hover:bg-app-hover">Pomiń</button>
          <button type="button" (click)="run('zrobione')" class="px-3 py-1.5 bg-success-strong hover:bg-success-strong-hover text-on-brand text-xs font-semibold rounded-md">✓ Zrobione</button>
        </footer>
      </aside>
    }
  `,
  styles: `
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-muted); margin-bottom: 0.25rem; }
  `,
})
export class SessionDrawer {
  private readonly engine = inject(PlanEngine);

  protected readonly s = computed(() => {
    const key = this.engine.store.openSession();
    return key ? this.engine.sessionByKey(key) : null;
  });
  /** Tryb `modyfikuj`: bez tła — command line pod spodem zostaje aktywny. */
  protected readonly modifying = computed(() => this.engine.mode() === 'modify');
  protected readonly day = computed(() => (this.s() ? DAY_LABELS[this.s()!.session.day] : ''));
  protected readonly status = computed(() => (this.s() ? (this.engine.store.state().status[this.s()!.key] ?? null) : null));
  protected readonly rows = computed(() => {
    const ref = this.s();
    if (!ref) return [];
    return [
      ...ref.session.main.map((block) => ({ block, accessory: false, load: this.engine.loadRow(block) })),
      ...ref.session.accessories.map((block) => ({ block, accessory: true, load: this.engine.loadRow(block) })),
    ];
  });

  /** Paliwo sesji: fueling sesji nadpisuje domyślne periWorkout; kofeina domyślnie z nutrition.caffeine. */
  protected readonly fueling = computed(() => {
    const ref = this.s();
    const n = this.engine.store.plan()?.nutrition;
    if (!ref || !n) return null;
    const f = { ...(n.periWorkout ?? {}), ...(ref.session.fueling ?? {}) };
    if (f.caffeineMg === undefined && n.caffeine) f.caffeineMg = n.caffeine.preWorkoutMg;
    return f.pre || f.intra || f.post || f.caffeineMg !== undefined ? f : null;
  });
  protected readonly caffeineBefore = computed(() => this.engine.store.plan()?.nutrition.caffeine?.minutesBefore ?? null);

  protected drill(d: { sets?: number; reps?: string | number; durationSec?: number }): string {
    return [d.sets ? `${d.sets} x` : '', d.reps ?? '', d.durationSec ? `${d.durationSec} s` : ''].filter(Boolean).join(' ');
  }

  protected run(cmd: string): void {
    this.engine.run(cmd);
  }

  protected close(): void {
    if (this.engine.mode() === 'modify') return;
    this.engine.closeSession();
  }
}
