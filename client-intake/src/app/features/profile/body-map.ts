import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Injury } from '../../core/models/athlete.model';

/*
 * Mapa kontuzji na rysunku anatomicznym (public/anatomy/muscles-front-back.svg, Wikimedia Commons,
 * „Muscles front and back.svg", OpenStax & Tomáš Kebert & umimeto.org, CC BY-SA 4.0).
 * Punkty w układzie 600 × 523 (proporcje rysunku). Przód: środek x = 150, prawa strona zawodnika
 * po lewej stronie rysunku. Tył: środek x = 465, prawa strona zawodnika po prawej.
 */
const FRONT_X = 150;
const BACK_X = 465;

/** x = prawa strona zawodnika (null = punkt centralny), view = na którym widoku. */
const SPOTS: Record<string, { view: 'front' | 'back'; x: number | null; y: number }[]> = {
  szyja: [{ view: 'back', x: null, y: 92 }],
  bark: [
    { view: 'front', x: 96, y: 122 },
    { view: 'back', x: 515, y: 122 },
  ],
  klatka: [{ view: 'front', x: 125, y: 140 }],
  piersiowy: [{ view: 'back', x: null, y: 158 }],
  lokiec: [{ view: 'back', x: 535, y: 192 }],
  nadgarstek: [{ view: 'front', x: 48, y: 262 }],
  ledzwia: [{ view: 'back', x: null, y: 222 }],
  biodro: [{ view: 'front', x: 116, y: 238 }],
  pachwina: [{ view: 'front', x: 137, y: 258 }],
  dwuglowe: [{ view: 'back', x: 483, y: 318 }],
  kolano: [{ view: 'front', x: 131, y: 356 }],
  kostka: [{ view: 'front', x: 133, y: 470 }],
};

interface Marker {
  x: number;
  y: number;
  color: string;
  severe: boolean;
  label: string;
}

/** Mapa ciała z kontuzjami: kolor = ból 0–10 (tokeny --pain-*), puls dla bólu ≥ 7. */
@Component({
  selector: 'app-body-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="relative w-full aspect-[600/523] select-none" role="img" [attr.aria-label]="ariaLabel()">
      <img src="anatomy/muscles-front-back.svg" alt="" class="absolute inset-0 w-full h-full" draggable="false" />
      <svg viewBox="0 0 600 523" class="absolute inset-0 w-full h-full" aria-hidden="true">
        <text x="150" y="514" text-anchor="middle" class="fill-app-muted" font-size="16" font-family="JetBrains Mono, monospace">przód</text>
        <text x="465" y="514" text-anchor="middle" class="fill-app-muted" font-size="16" font-family="JetBrains Mono, monospace">tył</text>
        @for (m of markers(); track $index) {
          <g>
            <title>{{ m.label }}</title>
            @if (m.severe) {
              <circle [attr.cx]="m.x" [attr.cy]="m.y" r="22" [attr.fill]="m.color" opacity="0.3" class="pulse-dot" />
            }
            <circle [attr.cx]="m.x" [attr.cy]="m.y" r="11" [attr.fill]="m.color" stroke="white" stroke-width="3" />
          </g>
        }
      </svg>
    </figure>
    <figcaption class="text-[9px] text-app-muted leading-tight mt-1">
      Rysunek:
      <a href="https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg" target="_blank" rel="noopener" class="underline">OpenStax, Tomáš Kebert, umimeto.org</a>,
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener" class="underline">CC BY-SA 4.0</a>
    </figcaption>
  `,
  styles: `
    .pulse-dot { transform-box: fill-box; transform-origin: center; animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(0.7); opacity: 0.4; } 50% { transform: scale(1.3); opacity: 0.1; } }
    @media (prefers-reduced-motion: reduce) { .pulse-dot { animation: none; } }
  `,
})
export class BodyMap {
  readonly injuries = input<Injury[]>([]);

  protected readonly markers = computed<Marker[]>(() =>
    this.injuries().flatMap((k) =>
      (SPOTS[k.obszar] ?? []).flatMap((spot) => {
        const center = spot.view === 'front' ? FRONT_X : BACK_X;
        const base = { y: spot.y, color: painColor(k.bol), severe: (k.bol ?? 0) >= 7, label: `${k.nazwa} — ból ${k.bol ?? '?'}/10` };
        if (spot.x === null) return [{ ...base, x: center }];
        const right = spot.x;
        const left = 2 * center - spot.x;
        if (k.strona === 'P') return [{ ...base, x: right }];
        if (k.strona === 'L') return [{ ...base, x: left }];
        return [
          { ...base, x: right },
          { ...base, x: left },
        ];
      }),
    ),
  );

  protected readonly ariaLabel = computed(() =>
    this.injuries().length ? 'Kontuzje: ' + this.injuries().map((k) => `${k.nazwa} ${k.bol ?? '?'}/10`).join(', ') : 'Brak kontuzji',
  );
}

export function painColor(pain: number | null): string {
  if (pain === null || pain < 4) return 'var(--pain-low)';
  return pain < 7 ? 'var(--pain-mid)' : 'var(--pain-high)';
}
