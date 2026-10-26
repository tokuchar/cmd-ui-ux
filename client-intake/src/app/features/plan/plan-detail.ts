import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CardioSession, DAY_CODES, DAY_LABELS, DayCode, FOCUS_COLORS, FOCUS_LABELS, Session, sessionKey } from '../../core/models/plan.model';
import { weekDate } from '../../core/plan/graph-layout';
import { PlanEngine } from '../../core/plan/plan-engine';
import { PLAN_COMMANDS } from '../../core/plan/plan-commands';
import { EVENT_TYPES, REGEN_THRESHOLD, WATCH_THRESHOLD } from '../../core/config/events.config';
import { VERDICT_LABELS } from '../../core/plan/events';
import { statsText } from '../../core/plan/stats';

/** Panel pod grafem — treść zależy od komendy (tydzień, makro, dieta, sen, ciężary, import…). */
@Component({
  selector: 'app-plan-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  host: { class: 'block' },
  templateUrl: './plan-detail.html',
})
export class PlanDetail {
  protected readonly engine = inject(PlanEngine);
  protected readonly store = this.engine.store;
  protected readonly ref = this.store.currentRef;
  protected readonly labels = DAY_LABELS;
  protected readonly focusLabels = FOCUS_LABELS;
  protected readonly focusColors = FOCUS_COLORS;
  protected readonly importDraft = signal('');
  protected readonly eventTypes = EVENT_TYPES;
  protected readonly verdictLabels = VERDICT_LABELS;
  protected readonly regenThreshold = REGEN_THRESHOLD;
  protected readonly watchThreshold = WATCH_THRESHOLD;
  /** Porady: filtr kategorii + tylko obowiązujące w bieżącym tygodniu, posortowane po priorytecie. */
  protected readonly tips = computed(() => {
    const week = this.store.current();
    const q = this.engine.tipFilter();
    return (this.store.plan()?.nutrition.tips ?? [])
      .filter((t) => !t.weeks || (week >= t.weeks[0] && week <= t.weeks[1]))
      .filter((t) => !q || t.category.startsWith(q) || t.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
  });
  protected readonly tipIcons: Record<string, string> = { faza: '🎯', zdrowie: '🩺', okolotreningowo: '⏱', nawodnienie: '💧', suplementacja: '💊', sen: '😴', nawyki: '🔁' };
  protected readonly statsLines = computed(() => statsText(this.engine.stats(), this.engine.zones()));
  /** Pasek wyniku: 0 … 1,5 × próg przegenerowania. */
  protected readonly scorePct = computed(() => Math.min(100, (this.engine.assessment().score / (REGEN_THRESHOLD * 1.5)) * 100));
  protected readonly dailyDesc = computed(() => this.store.daily().slice().reverse().slice(0, 21));

  protected readonly cardioText = (c: { minutes: number; zone: string | null; hr: number | null }) => `${c.minutes}′${c.zone ? ' ' + c.zone : ''}${c.hr ? ' @' + c.hr : ''}`;

  protected zoneText(zone: string | undefined): string {
    const z = this.engine.zones().find((x) => x.zone === zone);
    return z ? `${z.min}–${z.max} bpm` : '';
  }

  /** Nagłówek tygodnia: zakres dat + label tylko, gdy nie powtarza dat (te są już w nagłówku). */
  protected readonly weekHead = computed(() => {
    const ref = this.ref();
    const start = this.store.plan()?.meta.startDate;
    if (!ref || !start) return null;
    const from = weekDate(start, ref.micro.week);
    const to = weekDate(new Date(Date.parse(start) + 6 * 864e5).toISOString(), ref.micro.week);
    const label = ref.micro.label && !/\d{1,2}\.\d{1,2}/.test(ref.micro.label) ? ref.micro.label : null;
    return { range: from && to ? `${from}–${to}` : '', label, phase: ref.micro.isDeload ? 'deload' : FOCUS_LABELS[ref.meso.focus] };
  });

  /** Kafelki KPI tygodnia — liczby z jednostką i znaczeniem zamiast jednej linii skrótów. */
  protected readonly kpis = computed(() => {
    const ref = this.ref();
    if (!ref) return [];
    const m = ref.micro;
    const mass = Number(this.engine.profile().masa_kg) || null;
    const strengthMin = m.sessions.reduce((a, s) => a + s.durationMin, 0);
    const cardioMin = m.cardio.reduce((a, c) => a + c.minutes, 0);
    const protein = m.nutrition.trainingDay.protein;
    return [
      { label: 'Objętość', value: `${Math.round(m.volumeIndex * 100)}%`, hint: 'wzgl. najcięższego tyg.' },
      { label: 'Intensywność', value: `${Math.round(m.intensityIndex * 100)}%`, hint: 'wzgl. najcięższego tyg.' },
      { label: 'Kcal', value: `${m.nutrition.trainingDay.kcal}`, hint: `trening · wolny ${m.nutrition.restDay.kcal}` },
      { label: 'Białko', value: `${protein} g`, hint: mass ? `${(protein / mass).toFixed(1).replace('.', ',')} g/kg` : 'dzień treningowy' },
      { label: 'Sen', value: `${m.recovery.sleepH} h`, hint: `kroki ${m.recovery.steps.toLocaleString('pl-PL')}` },
      { label: 'Czas', value: `${(Math.round(((strengthMin + cardioMin) / 60) * 10) / 10).toString().replace('.', ',')} h`, hint: `${m.sessions.length} siła · ${m.cardio.length} cardio` },
    ];
  });

  /** Top set sesji: pierwszy blok główny (priorytet 1, jeśli oznaczony) — „4×6 · 140 kg · RIR 2". */
  protected topSet(s: Session): { exercise: string; set: string } | null {
    const b = s.main.find((x) => x.priority === 1) ?? s.main[0];
    if (!b) return null;
    const row = this.engine.loadRow(b);
    const load = row.kg ? `${row.kg} kg` : b.load.method === 'pct' && b.load.value ? `${b.load.value}%` : null;
    const rir = row.rir ?? b.rir;
    return { exercise: b.exercise, set: [`${b.sets}×${b.reps}`, load, rir !== null && rir !== undefined ? `RIR ${rir}` : null].filter(Boolean).join(' · ') };
  }

  protected cardioIcon(c: CardioSession): string {
    const t = c.type.toLowerCase();
    const hits = [
      { i: '🏃', at: t.search(/bieg|run|trucht/) },
      { i: '🚴', at: t.search(/rower|bike|cykl/) },
      { i: '🏊', at: t.search(/pływ|plyw|basen|swim/) },
      { i: '🚶', at: t.search(/spacer|marsz|chód|chod|walk/) },
      { i: '🚣', at: t.search(/wiosł|wiosl|ergometr/) },
    ].filter((h) => h.at >= 0);
    // pierwsze słowo w opisie wygrywa: „Rower stacjonarny / pływanie" → rower
    return hits.sort((a, b) => a.at - b.at)[0]?.i ?? '❤️';
  }

  /** Tydzień jako 7 „commitów" dnia: sesja / cardio / wolne. */
  protected readonly days = computed(() => {
    const ref = this.ref();
    if (!ref) return [];
    const status = this.store.state().status;
    return DAY_CODES.map((day) => {
      const sessions = ref.micro.sessions
        .map((s, i) => ({ s, key: sessionKey(ref.micro.week, s, i) }))
        .filter((x) => x.s.day === day)
        .map((x) => ({ ...x, status: status[x.key] ?? null }));
      return {
        day,
        label: DAY_LABELS[day],
        short: day.toUpperCase(),
        sessions,
        cardio: ref.micro.cardio.filter((c) => c.day === day),
        highCarb: ref.micro.nutrition.highCarbDays.includes(day),
        today: this.store.current() === this.store.head() && todayCode() === day,
      };
    });
  });

  protected readonly mesos = computed(() => {
    const out = new Map<string, { id: string; name: string; focus: string; color: string; from: number; to: number; deloads: number[]; kcal: number; sleep: number; carbs: string; notes: string }>();
    for (const { meso, micro } of this.store.weeks()) {
      const cur = out.get(meso.id);
      if (cur) {
        cur.to = micro.week;
        if (micro.isDeload) cur.deloads.push(micro.week);
      } else {
        out.set(meso.id, {
          id: meso.id,
          name: meso.name,
          focus: FOCUS_LABELS[meso.focus],
          color: FOCUS_COLORS[meso.focus],
          from: micro.week,
          to: micro.week,
          deloads: micro.isDeload ? [micro.week] : [],
          kcal: meso.kcalAdjust,
          sleep: meso.sleepTargetH,
          carbs: meso.carbStrategy,
          notes: meso.notes ?? '',
        });
      }
    }
    return [...out.values()];
  });

  /** Kcal i sen po tygodniach — mini wykresy słupkowe (SVG). */
  protected readonly series = computed(() => {
    const weeks = this.store.weeks();
    const kcal = weeks.map((w) => w.micro.nutrition.trainingDay.kcal);
    const rest = weeks.map((w) => w.micro.nutrition.restDay.kcal);
    const sleep = weeks.map((w) => w.micro.recovery.sleepH);
    const steps = weeks.map((w) => w.micro.recovery.steps);
    return { weeks: weeks.map((w) => w.micro.week), kcal, rest, sleep, steps, maxKcal: Math.max(...kcal, 1), maxSteps: Math.max(...steps, 1) };
  });

  protected readonly prehab = computed(() => {
    const ref = this.ref();
    if (!ref) return { warmup: [], prehab: [], cooldown: [] };
    const uniq = <T extends { name: string }>(list: T[]) => [...new Map(list.map((d) => [d.name, d])).values()];
    return {
      warmup: uniq(ref.micro.sessions.flatMap((s) => s.warmup)),
      prehab: uniq(ref.micro.sessions.flatMap((s) => s.prehab)),
      cooldown: uniq(ref.micro.sessions.flatMap((s) => s.cooldown)),
    };
  });

  protected readonly commandGroups = (['nawigacja', 'info', 'trening', 'modyfikacja', 'zdarzenia', 'ai'] as const).map((g) => ({
    group: g,
    commands: PLAN_COMMANDS.filter((c) => c.group === g),
  }));

  protected bar(v: number, max: number, h = 40): number {
    return Math.max(2, (v / max) * h);
  }

  protected onImportInput(v: string): void {
    this.importDraft.set(v);
    this.engine.importText(v, false);
  }

  protected applyImport(): void {
    if (this.engine.importText(this.importDraft(), true)) this.importDraft.set('');
  }

  protected importFile(input: HTMLInputElement): void {
    input.files?.[0]?.text().then((t) => {
      this.onImportInput(t);
      input.value = '';
    });
  }

  protected dayLabel(d: DayCode): string {
    return DAY_LABELS[d];
  }
}

function todayCode(): DayCode {
  return (['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'so'] as DayCode[])[new Date().getDay()];
}
