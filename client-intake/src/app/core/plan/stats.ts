import { HrZone } from '../domain/calc';
import { WeekRef } from '../models/plan.model';
import { LogEntry, SessionStatus } from './plan.store';

/** Jeden dzień logów (komendy: makro, waga, sen, cardio). Klucz = data ISO RRRR-MM-DD. */
export interface DailyLog {
  date: string;
  makro?: { kcal: number; protein: number; carbs: number; fat: number };
  waga?: number;
  sen?: { h: number; q: number | null };
  cardio?: { minutes: number; zone: string | null; hr: number | null }[];
}

export interface PlanStats {
  days: number;
  makro: { kcal: number; protein: number; carbs: number; fat: number; logged: number; targetKcal: number; adherencePct: number } | null;
  waga: { avg7: number; trendKgPerWeek: number | null; plannedKgPerWeek: number | null; logged: number } | null;
  sen: { avgH: number; avgQ: number | null; targetH: number; logged: number } | null;
  cardio: { minutesPerWeek: number; byZone: Record<string, number>; logged: number } | null;
  sessions: { planned: number; done: number; skipped: number; adherencePct: number };
  e1rm: { lift: string; first: number; last: number; change: number }[];
}

const DAY = 864e5;

/**
 * Statystyki z logów do promptu korekty (okno `windowDays`): średnie makro i zgodność z celem kcal,
 * średnia i trend masy (regresja liniowa, kg/tydz.) vs plan, sen vs cel, cardio w strefach,
 * wykonanie sesji do bieżącego tygodnia, zmiana e1RM z `zaloguj`.
 */
export function buildStats(input: {
  daily: DailyLog[];
  weeks: WeekRef[];
  head: number;
  status: Record<string, SessionStatus>;
  log: LogEntry[];
  bodyKg: number | null;
  tempoPct: number | null;
  faza: string;
  windowDays?: number;
  now?: number;
}): PlanStats {
  const windowDays = input.windowDays ?? 14;
  const now = input.now ?? Date.now();
  const recent = input.daily.filter((d) => now - Date.parse(d.date) <= windowDays * DAY).sort((a, b) => a.date.localeCompare(b.date));
  const current = input.weeks.find((w) => w.micro.week === input.head)?.micro;

  const macros = recent.filter((d) => d.makro).map((d) => d.makro!);
  const targetKcal = current ? Math.round((current.nutrition.trainingDay.kcal * current.sessions.length + current.nutrition.restDay.kcal * (7 - current.sessions.length)) / 7) : 0;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const makro = macros.length
    ? {
        kcal: Math.round(avg(macros.map((m) => m.kcal))),
        protein: Math.round(avg(macros.map((m) => m.protein))),
        carbs: Math.round(avg(macros.map((m) => m.carbs))),
        fat: Math.round(avg(macros.map((m) => m.fat))),
        logged: macros.length,
        targetKcal,
        adherencePct: targetKcal ? Math.round((avg(macros.map((m) => m.kcal)) / targetKcal) * 100) : 0,
      }
    : null;

  const weights = recent.filter((d) => d.waga).map((d) => ({ t: Date.parse(d.date) / DAY, kg: d.waga! }));
  const last7 = weights.filter((w) => now / DAY - w.t <= 7);
  const sign = input.faza === 'redukcja' ? -1 : input.faza === 'masa' ? 1 : 0;
  const waga = weights.length
    ? {
        avg7: round1(avg((last7.length ? last7 : weights).map((w) => w.kg))),
        trendKgPerWeek: weights.length >= 4 ? round2(slope(weights) * 7) : null,
        plannedKgPerWeek: input.bodyKg && input.tempoPct ? round2((sign * input.bodyKg * input.tempoPct) / 100) : sign === 0 ? 0 : null,
        logged: weights.length,
      }
    : null;

  const sleeps = recent.filter((d) => d.sen).map((d) => d.sen!);
  const quals = sleeps.filter((s) => s.q !== null).map((s) => s.q!);
  const sen = sleeps.length
    ? { avgH: round1(avg(sleeps.map((s) => s.h))), avgQ: quals.length ? round1(avg(quals)) : null, targetH: current?.recovery.sleepH ?? 8, logged: sleeps.length }
    : null;

  const cardioEntries = recent.flatMap((d) => d.cardio ?? []);
  const byZone: Record<string, number> = {};
  for (const c of cardioEntries) byZone[c.zone ?? '?'] = (byZone[c.zone ?? '?'] ?? 0) + c.minutes;
  const cardio = cardioEntries.length
    ? { minutesPerWeek: Math.round((cardioEntries.reduce((s, c) => s + c.minutes, 0) / windowDays) * 7), byZone, logged: cardioEntries.length }
    : null;

  const pastWeeks = input.weeks.filter((w) => w.micro.week <= input.head);
  const planned = pastWeeks.reduce((n, w) => n + w.micro.sessions.length, 0);
  const statuses = Object.values(input.status);
  const done = statuses.filter((s) => s === 'done').length;
  const skipped = statuses.filter((s) => s === 'skipped').length;

  const e1rm = [...new Set(input.log.map((l) => l.lift))].flatMap((lift) => {
    const hits = input.log.filter((l) => l.lift === lift && l.e1rm);
    if (!hits.length) return [];
    const first = hits[0].e1rm!;
    const last = hits[hits.length - 1].e1rm!;
    return [{ lift, first, last, change: round1(last - first) }];
  });

  return {
    days: windowDays,
    makro,
    waga,
    sen,
    cardio,
    sessions: { planned, done, skipped, adherencePct: planned ? Math.round((done / planned) * 100) : 0 },
    e1rm,
  };
}

/** Tekst statystyk do promptu (czytelny dla AI i trenera). */
export function statsText(s: PlanStats, zones: HrZone[]): string[] {
  const out = [`Okno: ostatnie ${s.days} dni.`];
  out.push(
    s.makro
      ? `Makro (śr. z ${s.makro.logged} dni): ${s.makro.kcal} kcal, B ${s.makro.protein} / W ${s.makro.carbs} / T ${s.makro.fat} g — cel tygodnia ~${s.makro.targetKcal} kcal (${s.makro.adherencePct}%).`
      : 'Makro: brak logów.',
  );
  out.push(
    s.waga
      ? `Masa: śr. 7 dni ${s.waga.avg7} kg; trend ${s.waga.trendKgPerWeek ?? '?'} kg/tydz. (plan ${s.waga.plannedKgPerWeek ?? '?'} kg/tydz.), ${s.waga.logged} pomiarów.`
      : 'Masa: brak pomiarów.',
  );
  out.push(s.sen ? `Sen: śr. ${s.sen.avgH} h (cel ${s.sen.targetH} h)${s.sen.avgQ !== null ? `, jakość ${s.sen.avgQ}/10` : ''}, ${s.sen.logged} nocy.` : 'Sen: brak logów.');
  out.push(
    s.cardio
      ? `Cardio: ~${s.cardio.minutesPerWeek} min/tydz.; strefy: ${Object.entries(s.cardio.byZone).map(([z, m]) => `${z} ${m} min`).join(', ')}.`
      : 'Cardio: brak logów.',
  );
  out.push(`Sesje do bieżącego tygodnia: zaplanowane ${s.sessions.planned}, wykonane ${s.sessions.done} (${s.sessions.adherencePct}%), pominięte ${s.sessions.skipped}.`);
  if (s.e1rm.length) out.push('e1RM z logów: ' + s.e1rm.map((e) => `${e.lift} ${e.first} → ${e.last} kg (${e.change >= 0 ? '+' : ''}${e.change})`).join('; ') + '.');
  if (zones.length) out.push('Strefy tętna: ' + zones.map((z) => `${z.zone} ${z.min}–${z.max}`).join(', ') + ' bpm.');
  return out;
}

/** Nachylenie regresji liniowej (kg na dzień). */
function slope(points: { t: number; kg: number }[]): number {
  const n = points.length;
  const mt = points.reduce((s, p) => s + p.t, 0) / n;
  const mk = points.reduce((s, p) => s + p.kg, 0) / n;
  const num = points.reduce((s, p) => s + (p.t - mt) * (p.kg - mk), 0);
  const den = points.reduce((s, p) => s + (p.t - mt) ** 2, 0);
  return den ? num / den : 0;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
