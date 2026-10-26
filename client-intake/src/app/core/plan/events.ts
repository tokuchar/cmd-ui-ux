import {
  CONTINUITY_DAYS,
  CONTINUITY_FACTOR,
  EVENT_TYPES,
  EventType,
  HALF_LIFE_DAYS,
  MAX_REGENS_PER_28_DAYS,
  MIN_DAYS_BETWEEN_REGENS,
  REGEN_THRESHOLD,
  WATCH_THRESHOLD,
} from '../config/events.config';

/** Zgłoszone zdarzenie (ręcznie: `zglos`, `kontuzja`; automatycznie: logi snu i wagi). */
export interface PlanEvent {
  id: string;
  /** ISO data-czas zgłoszenia. */
  at: string;
  week: number;
  type: EventType;
  /** 1 = lekkie, 2 = średnie, 3 = mocne. */
  severity: 1 | 2 | 3;
  note: string;
  /** Wygenerowane z logów (sen, waga). */
  auto?: boolean;
}

/** Przegenerowanie planu (import pełnego planu albo korekty) — znacznik na grafie. */
export interface RegenMark {
  at: string;
  week: number;
  kind: 'full' | 'patch';
  label: string;
  /** Wynik zdarzeń w chwili przegenerowania. */
  score: number;
}

export interface ScoredEvent {
  event: PlanEvent;
  freshness: number;
  continuity: boolean;
  points: number;
}

export type Verdict = 'ok' | 'watch' | 'regen';

export interface EventAssessment {
  score: number;
  verdict: Verdict;
  items: ScoredEvent[];
  /** Ostrzeżenia o zbyt częstych zmianach planu. */
  churn: string[];
  /** Dni od ostatniego przegenerowania (null = nigdy). */
  daysSinceRegen: number | null;
}

const DAY = 864e5;

function dayIndex(iso: string): number {
  return Math.floor(Date.parse(iso) / DAY);
}

/**
 * Ocena „czy przegenerować": zdarzenia od ostatniego przegenerowania z wagą × nasilenie ×
 * świeżość (półtrwanie) × ciągłość (ten sam typ kilka dni z rzędu). Wagi: config/events.config.ts.
 */
export function assessEvents(events: PlanEvent[], regens: RegenMark[], now = Date.now()): EventAssessment {
  const lastRegen = regens.length ? Date.parse(regens[regens.length - 1].at) : null;
  const pending = events.filter((e) => lastRegen === null || Date.parse(e.at) > lastRegen);
  const daysByType = new Map<EventType, Set<number>>();
  for (const e of pending) {
    if (!daysByType.has(e.type)) daysByType.set(e.type, new Set());
    daysByType.get(e.type)!.add(dayIndex(e.at));
  }
  const items = pending.map((event) => {
    const age = Math.max(0, (now - Date.parse(event.at)) / DAY);
    const freshness = Math.pow(0.5, age / HALF_LIFE_DAYS);
    const continuity = runLength(daysByType.get(event.type)!, dayIndex(event.at)) >= CONTINUITY_DAYS;
    const points = EVENT_TYPES[event.type].weight * event.severity * freshness * (continuity ? CONTINUITY_FACTOR : 1);
    return { event, freshness, continuity, points: round1(points) };
  });
  const score = round1(items.reduce((s, i) => s + i.points, 0));
  return {
    score,
    verdict: score >= REGEN_THRESHOLD ? 'regen' : score >= WATCH_THRESHOLD ? 'watch' : 'ok',
    items: items.sort((a, b) => b.points - a.points),
    churn: churnWarnings(regens, now),
    daysSinceRegen: lastRegen === null ? null : Math.floor((now - lastRegen) / DAY),
  };
}

/** Ostrzeżenia, gdy plan zmienia się częściej, niż da się ocenić efekt bloku. */
export function churnWarnings(regens: RegenMark[], now = Date.now()): string[] {
  const out: string[] = [];
  const last = regens[regens.length - 1];
  if (last) {
    const days = Math.floor((now - Date.parse(last.at)) / DAY);
    if (days < MIN_DAYS_BETWEEN_REGENS) {
      out.push(`Ostatnie przegenerowanie ${days} dni temu — zmiana częściej niż co ${MIN_DAYS_BETWEEN_REGENS} dni utrudnia ocenę, czy blok działa.`);
    }
  }
  const recent = regens.filter((r) => now - Date.parse(r.at) <= 28 * DAY).length;
  if (recent >= MAX_REGENS_PER_28_DAYS) {
    out.push(`${recent} przegenerowania w ostatnich 28 dniach — rozważ drobne korekty (modyfikuj, krocej) zamiast nowego planu.`);
  }
  return out;
}

/** Długość serii kolejnych dni zawierającej `day`. */
function runLength(days: Set<number>, day: number): number {
  let n = 1;
  for (let d = day - 1; days.has(d); d--) n++;
  for (let d = day + 1; days.has(d); d++) n++;
  return n;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export const VERDICT_LABELS: Record<Verdict, string> = {
  ok: 'plan aktualny',
  watch: 'obserwuj',
  regen: 'sugerowane przegenerowanie',
};
