import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { COL_W, layoutPlan, PAD_L } from '../../core/plan/graph-layout';
import { PlanEngine } from '../../core/plan/plan-engine';

/**
 * Plan Graph — poziomy „git tree": main = makrocykl, gałęzie = mezocykle, tory równoległe = cele dodatkowe.
 * Klik / ←→ = tydzień, Enter = szczegóły tygodnia. Kolory z tokenów --phase-*.
 */
@Component({
  selector: 'app-plan-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (layout(); as g) {
      <div
        #scroller
        class="relative overflow-x-auto overscroll-x-contain rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        tabindex="0"
        role="group"
        aria-label="Graf makrocyklu — strzałki zmieniają tydzień"
        (keydown)="onKey($event)"
      >
        <svg [attr.width]="g.width" [attr.height]="g.height + 8" class="block" font-family="JetBrains Mono, monospace">
          <!-- Kolumna „dziś" (bieżący tydzień) i zaznaczenia -->
          <rect [attr.x]="x(head()) - colW / 2" y="0" [attr.width]="colW" [attr.height]="g.height + 8" fill="var(--row-highlight)" rx="6" />
          @if (selected() !== head()) {
            <rect [attr.x]="x(selected()) - colW / 2 + 2" y="2" [attr.width]="colW - 4" [attr.height]="g.height + 4" fill="none" stroke="var(--brand)" stroke-dasharray="3 3" rx="6" />
          }

          <!-- Numery tygodni + data poniedziałku -->
          @for (w of g.weeks; track w.week) {
            <text [attr.x]="w.x" y="12" text-anchor="middle" font-size="10" [attr.fill]="w.week === head() ? 'var(--brand-text)' : 'var(--app-muted)'" [attr.font-weight]="w.week === head() ? 700 : 400">
              W{{ w.week }}
            </text>
            <text [attr.x]="w.x" y="24" text-anchor="middle" font-size="8.5" [attr.fill]="w.week === head() ? 'var(--brand-text)' : 'var(--app-muted)'">{{ w.date }}</text>
          }
          <text [attr.x]="x(head())" [attr.y]="g.height + 4" text-anchor="middle" font-size="9" font-weight="700" fill="var(--brand-text)">dziś</text>

          <!-- Etykiety torów (lewa kolumna); pełna nazwa w tooltipie, gdy ucięta -->
          @for (l of g.lanes; track l.id) {
            <text [attr.x]="padL - 14" [attr.y]="l.y + 3.5" text-anchor="end" font-size="10" [attr.fill]="l.color" [attr.font-weight]="l.kind === 'main' ? 700 : 400">
              <title>{{ l.label }}</title>
              {{ trim(l.label) }}
            </text>
          }

          <!-- Nazwy bloków (mezocykli) pod pierwszym tygodniem gałęzi -->
          @for (m of g.mesoLabels; track m.mesoId) {
            <text [attr.x]="m.x" [attr.y]="m.y" font-size="9" font-weight="600" [attr.fill]="m.color" [attr.opacity]="dim(m.mesoId) ? 0.3 : 1">{{ m.label }}</text>
          }

          <!-- Krawędzie: main, fork/merge, commity gałęzi, tory celów -->
          @for (e of g.edges; track $index) {
            <path
              [attr.d]="e.d"
              fill="none"
              [attr.stroke]="e.color"
              [attr.stroke-width]="e.width"
              stroke-linecap="round"
              [attr.stroke-dasharray]="e.dashed ? '2 5' : null"
              [attr.opacity]="dim(e.mesoId) ? 0.25 : 1"
            />
          }

          <!-- Przegenerowania planu (↻) -->
          @for (r of g.regens; track $index) {
            <g>
              <title>{{ r.tooltip }}</title>
              <line [attr.x1]="r.x" [attr.x2]="r.x" y1="30" [attr.y2]="g.height" stroke="var(--warning)" stroke-width="1.5" [attr.stroke-dasharray]="r.kind === 'patch' ? '4 3' : null" />
              <rect [attr.x]="r.x - 2" y="28" width="4" height="4" fill="var(--warning)" />
              <text [attr.x]="r.x + 4" y="39" font-size="9" font-weight="700" fill="var(--warning)">{{ r.label }}</text>
            </g>
          }

          <!-- Zdarzenia (pod torami) -->
          @for (e of g.events; track e.x) {
            <g [attr.transform]="'translate(' + e.x + ',' + (g.height - 16) + ')'">
              <title>{{ e.tooltip }}</title>
              <path d="M 0 -7 L 6 4 L -6 4 Z" [attr.fill]="eventColor(e.severity)" />
              @if (e.count > 1) {
                <text x="8" y="4" font-size="9" [attr.fill]="eventColor(e.severity)">{{ e.count }}</text>
              }
            </g>
          }

          <!-- Tag startu -->
          @if (g.tag; as t) {
            <g [attr.transform]="'translate(' + t.x + ',' + g.mainY + ')'">
              <title>Zawody / test maksów</title>
              <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--phase-real)" stroke="var(--app-surface)" stroke-width="2" />
              <text x="14" y="3.5" font-size="10" font-weight="700" fill="var(--phase-real)">{{ t.label }}</text>
            </g>
          }

          <!-- Węzły tygodni -->
          @for (n of g.nodes; track n.week) {
            <g
              class="cursor-pointer node"
              [attr.transform]="'translate(' + n.x + ',' + n.y + ')'"
              [attr.opacity]="dim(n.mesoId) ? 0.3 : 1"
              (click)="engine.selectWeek(n.week)"
            >
              <title>{{ n.tooltip }}</title>
              <circle r="14" fill="transparent" />
              @for (c of carbDots(n.highCarb); track $index) {
                <circle [attr.cx]="c" cy="-13" r="1.8" fill="var(--carb-high)" />
              }
              @switch (n.kind) {
                @case ('deload') {
                  <circle r="7.5" fill="var(--app-surface)" [attr.stroke]="n.color" stroke-width="2" />
                  <path d="M 0 -7.5 A 7.5 7.5 0 0 1 0 7.5 Z" [attr.fill]="n.color" />
                }
                @case ('taper') {
                  <circle r="8" fill="var(--app-surface)" [attr.stroke]="n.color" stroke-width="2" />
                  <circle r="4" [attr.fill]="n.color" />
                }
                @default {
                  <circle r="7.5" [attr.fill]="n.color" [attr.fill-opacity]="0.35 + n.intensity * 0.65" [attr.stroke]="n.color" stroke-width="2" />
                }
              }
              @if (n.done && n.done === n.total) {
                <text y="3.5" text-anchor="middle" font-size="9" font-weight="700" fill="var(--on-brand)">✓</text>
              } @else if (n.done || n.skipped) {
                <circle r="11" fill="none" stroke="var(--success)" stroke-width="2" [attr.stroke-dasharray]="progressDash(n.done, n.total)" transform="rotate(-90)" />
              }
              @if (n.week === selected()) {
                <circle r="12" fill="none" stroke="var(--brand)" stroke-width="2" />
              }
            </g>
          }

          <!-- Kamienie milowe celów dodatkowych -->
          @for (m of g.goalMarks; track $index) {
            @if (m.milestone) {
              <g [attr.transform]="'translate(' + m.x + ',' + m.y + ')'">
                <title>{{ m.label }}</title>
                <circle r="6" fill="var(--app-surface)" stroke="var(--phase-side)" stroke-width="2" />
                <circle r="2.5" fill="var(--phase-side)" />
              </g>
            } @else {
              <circle [attr.cx]="m.x" [attr.cy]="m.y" r="2" fill="var(--phase-side)" opacity="0.6" />
            }
          }
        </svg>
      </div>

      <!-- Legenda -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-app-muted">
        @for (l of legend; track l.label) {
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" [style.background]="l.color"></span>{{ l.label }}</span>
        }
        <span class="flex items-center gap-1.5"><span class="text-[11px]">◐</span>deload</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full inline-block bg-carb-high"></span>dzień high-carb</span>
        <span class="flex items-center gap-1.5"><span class="text-warning font-bold">↻</span>przegenerowanie</span>
        <span class="flex items-center gap-1.5"><span class="text-pain-mid">▲</span>zdarzenie</span>
        <span>grubość = objętość · jasność = intensywność</span>
      </div>
    }
  `,
  styles: `
    .node circle { transition: r 120ms ease; }
    .node:hover > circle:nth-of-type(2) { stroke-width: 3; }
  `,
})
export class PlanGraph {
  protected readonly engine = inject(PlanEngine);
  private readonly store = this.engine.store;
  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');

  protected readonly colW = COL_W;
  protected readonly padL = PAD_L;
  protected readonly head = this.store.head;
  protected readonly selected = this.store.current;

  protected readonly layout = computed(() => {
    const plan = this.store.plan();
    return plan ? layoutPlan(plan, this.store.weeks(), this.store.state().status, { regens: this.store.regens(), events: this.store.events() }) : null;
  });

  protected readonly legend = [
    { label: 'akumulacja', color: 'var(--phase-accum)' },
    { label: 'akumulacja · hipertrofia', color: 'var(--phase-hyper)' },
    { label: 'intensyfikacja', color: 'var(--phase-intens)' },
    { label: 'realizacja', color: 'var(--phase-real)' },
    { label: 'taper', color: 'var(--phase-taper)' },
    { label: 'cele dodatkowe', color: 'var(--phase-side)' },
  ];

  constructor() {
    // Zaznaczony tydzień zawsze widoczny (na telefonie graf przewija się w poziomie).
    afterRenderEffect(() => {
      const el = this.scroller()?.nativeElement;
      const x = this.x(this.selected());
      if (!el) return;
      if (x < el.scrollLeft + PAD_L || x > el.scrollLeft + el.clientWidth - COL_W) {
        el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
      }
    });
  }

  protected x(week: number): number {
    return PAD_L + (week - 1) * COL_W;
  }

  protected dim(mesoId: string): boolean {
    const h = this.store.highlight();
    return !!h && h !== mesoId && mesoId !== 'main';
  }

  protected eventColor(severity: 1 | 2 | 3): string {
    return severity === 3 ? 'var(--pain-high)' : severity === 2 ? 'var(--pain-mid)' : 'var(--pain-low)';
  }

  protected carbDots(n: number): number[] {
    return Array.from({ length: Math.min(n, 4) }, (_, i) => (i - (Math.min(n, 4) - 1) / 2) * 5);
  }

  protected progressDash(done: number, total: number): string {
    const c = 2 * Math.PI * 11;
    return `${(done / Math.max(total, 1)) * c} ${c}`;
  }

  protected trim(label: string): string {
    // ~6 px na znak przy 10 px JetBrains Mono → tyle mieści kolumna etykiet
    const max = Math.floor((PAD_L - 20) / 6);
    return label.length > max ? label.slice(0, max - 1) + '…' : label;
  }

  protected onKey(e: KeyboardEvent): void {
    const total = this.store.weeks().length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = Math.min(Math.max(this.selected() + (e.key === 'ArrowRight' ? 1 : -1), 1), total);
      this.engine.selectWeek(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.engine.selectWeek(this.selected());
    } else if (e.key === 'Escape') {
      this.store.highlight.set(null);
    }
  }
}
