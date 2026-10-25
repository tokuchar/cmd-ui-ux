import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  NgZone,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

/** Tokeny kolorów, z których budujemy wielobarwną aurorę (odcienie marki/grup). */
const COLOR_TOKENS = ['--bg-fx', '--group-2', '--group-4', '--group-6'];

/** Jedna „plama" aurory — pozycja oscyluje sinusoidalnie wokół punktu bazowego. */
interface Blob {
  color: number; // indeks w tablicy kolorów
  bx: number; // pozycja bazowa X (ułamek szerokości)
  by: number; // pozycja bazowa Y (ułamek wysokości)
  ax: number; // amplituda dryfu X (ułamek szerokości)
  ay: number; // amplituda dryfu Y (ułamek wysokości)
  px: number; // faza X
  py: number; // faza Y
  sp: number; // prędkość (rad/s)
  r: number; // promień (ułamek większego boku)
}

/**
 * Animowane tło: miękka „aurora" — kilka dużych, rozmytych plam w kolorach marki,
 * które powoli dryfują i przenikają się. Spokojne, bez spadających elementów.
 * Kolory czytane z tokenów → poprawne w trybie jasnym i ciemnym. rAF poza Angularem
 * (zoneless), ~30 fps, pauza gdy karta w tle, uszanowanie `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-animated-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    class: 'pointer-events-none absolute inset-0 z-0 overflow-hidden',
  },
  template: `<canvas #canvas class="block h-full w-full"></canvas>`,
})
export class AnimatedBackground {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  private ctx: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private colors: string[] = ['91, 91, 214']; // składowe RGB z tokenów
  private opacity = 0.11; // z --bg-fx-opacity
  private lastDraw = 0;
  private reduced = false;

  // Stały układ plam (deterministyczny — spokojna, powtarzalna kompozycja).
  private readonly blobs: Blob[] = [
    { color: 0, bx: 0.22, by: 0.3, ax: 0.1, ay: 0.08, px: 0.0, py: 1.1, sp: 0.09, r: 0.6 },
    { color: 1, bx: 0.78, by: 0.28, ax: 0.09, ay: 0.1, px: 2.0, py: 0.4, sp: 0.07, r: 0.55 },
    { color: 2, bx: 0.7, by: 0.75, ax: 0.12, ay: 0.09, px: 4.1, py: 3.0, sp: 0.08, r: 0.65 },
    { color: 3, bx: 0.3, by: 0.72, ax: 0.1, ay: 0.11, px: 1.3, py: 5.2, sp: 0.06, r: 0.58 },
    { color: 0, bx: 0.5, by: 0.5, ax: 0.14, ay: 0.1, px: 3.4, py: 2.2, sp: 0.05, r: 0.5 },
  ];

  constructor() {
    const win = this.doc.defaultView!;
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = motion.matches;

    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) return;

      this.readColors();
      this.resize();

      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.host.nativeElement);

      const onVisibility = () => (this.doc.hidden ? this.stop() : this.startLoop());
      this.doc.addEventListener('visibilitychange', onVisibility);

      const onMotion = (e: MediaQueryListEvent) => {
        this.reduced = e.matches;
        this.stop();
        this.reduced ? this.drawStaticFrame() : this.startLoop();
      };
      motion.addEventListener('change', onMotion);

      this.reduced ? this.drawStaticFrame() : this.startLoop();

      this.destroyRef.onDestroy(() => {
        this.stop();
        ro.disconnect();
        this.doc.removeEventListener('visibilitychange', onVisibility);
        motion.removeEventListener('change', onMotion);
      });
    });

    // Zmiana motywu → ponowny odczyt kolorów z tokenów (.dark nadpisuje odcienie).
    effect(() => {
      this.theme.isDark();
      if (!this.ctx) return;
      this.readColors();
      if (this.reduced) this.drawStaticFrame();
    });
  }

  /** Odczytuje paletę (COLOR_TOKENS → RGB) i --bg-fx-opacity z aktualnego motywu. */
  private readColors(): void {
    const styles = getComputedStyle(this.doc.documentElement);
    const palette = COLOR_TOKENS.map((t) => this.hexToRgb(styles.getPropertyValue(t).trim())).filter(
      (c): c is string => c !== null,
    );
    if (palette.length) this.colors = palette;
    const op = parseFloat(styles.getPropertyValue('--bg-fx-opacity'));
    if (!Number.isNaN(op)) this.opacity = op;
  }

  private hexToRgb(hex: string): string | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  private resize(): void {
    const el = this.host.nativeElement as HTMLElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;

    this.dpr = Math.min(this.doc.defaultView!.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;

    const canvas = this.canvasRef().nativeElement;
    canvas.width = Math.floor(w * this.dpr);
    canvas.height = Math.floor(h * this.dpr);
    this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.reduced) this.drawStaticFrame();
  }

  private startLoop(): void {
    if (this.rafId || this.reduced || this.doc.hidden) return;
    // rAF poza Angularem: brak wyzwalania detekcji zmian (zoneless-friendly).
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        // Aurora jest wolna — ~30 fps w zupełności wystarcza i oszczędza CPU.
        if (now - this.lastDraw >= 33) {
          this.lastDraw = now;
          this.draw(now / 1000);
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  private stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Jedna klatka aurory w czasie t (sekundy): miękkie, przenikające się plamy. */
  private draw(t: number): void {
    const ctx = this.ctx!;
    const { width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);

    // Rozmycie wygładza krawędzie i łączy plamy w jednolitą poświatę.
    ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.06)}px)`;
    const alpha = Math.min(this.opacity * 3.4, 0.6);
    const maxSide = Math.max(w, h);

    for (const b of this.blobs) {
      const cx = (b.bx + b.ax * Math.sin(t * b.sp + b.px)) * w;
      const cy = (b.by + b.ay * Math.cos(t * b.sp + b.py)) * h;
      const radius = b.r * maxSide;
      const rgb = this.colors[b.color % this.colors.length];

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.filter = 'none';
  }

  /** Reduced motion: pojedyncza statyczna klatka aurory (bez pętli). */
  private drawStaticFrame(): void {
    if (!this.ctx) return;
    this.draw(0);
  }
}
