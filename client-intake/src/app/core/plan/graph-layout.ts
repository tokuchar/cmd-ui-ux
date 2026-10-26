import { FOCUS_COLORS, FOCUS_LABELS, PHASE_LABELS, sessionKey, TrainingPlan, WeekRef } from '../models/plan.model';
import { EVENT_TYPES } from '../config/events.config';
import { PlanEvent, RegenMark } from './events';
import { SessionStatus } from './plan.store';

/*
 * Układ grafu planu jak `git log --graph`, tylko poziomo:
 *  - oś X = tygodnie (commity), tor 0 = makrocykl (`main`),
 *  - każdy mezocykl = gałąź odchodząca od main na swoim torze i wracająca (merge) po ostatnim tygodniu,
 *  - cele dodatkowe = równoległe tory pod spodem z kamieniami milowymi,
 *  - deload ◐, taper ◉, start ◆ (tag na main), „dziś" = bieżący tydzień,
 *  - tory mezocykli opisane fazą, nazwa bloku pod pierwszym tygodniem gałęzi.
 * Czysta funkcja → łatwa do testów; komponent PlanGraph tylko rysuje wynik.
 */

export const COL_W = 54;
export const LANE_H = 30;
/** Kolumna etykiet torów — mieści „akumulacja / intensyfikacja" bez ucinania. */
export const PAD_L = 192;
/** Nagłówek: numer tygodnia + data poniedziałku. */
export const PAD_T = 46;

export interface GraphNode {
  week: number;
  x: number;
  y: number;
  lane: number;
  color: string;
  kind: 'week' | 'deload' | 'taper';
  /** 0–1 → krycie wypełnienia. */
  intensity: number;
  mesoId: string;
  done: number;
  skipped: number;
  total: number;
  highCarb: number;
  tooltip: string;
}

export interface GraphEdge {
  d: string;
  color: string;
  width: number;
  mesoId: string;
  dashed?: boolean;
}

export interface GraphLane {
  y: number;
  label: string;
  color: string;
  id: string;
  kind: 'main' | 'meso' | 'goal';
}

/** Nazwa bloku (mezocyklu) pod pierwszym tygodniem jego gałęzi (nad nim są kropki high-carb). */
export interface MesoLabel {
  x: number;
  y: number;
  label: string;
  color: string;
  mesoId: string;
}

export interface GoalMark {
  x: number;
  y: number;
  label: string;
  milestone: boolean;
}

/** Przegenerowanie planu: pionowa linia ↻ przed tygodniem, od którego obowiązuje nowa wersja. */
export interface RegenLine {
  x: number;
  label: string;
  kind: 'full' | 'patch';
  tooltip: string;
}

/** Zdarzenia tygodnia: znacznik pod osią (kolor = najwyższe nasilenie). */
export interface EventMark {
  x: number;
  count: number;
  severity: 1 | 2 | 3;
  tooltip: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: GraphLane[];
  goalMarks: GoalMark[];
  /** date = poniedziałek tygodnia „dd.MM". */
  weeks: { week: number; x: number; date: string }[];
  mesoLabels: MesoLabel[];
  mainY: number;
  /** Tag zawodów / testu na końcu main. */
  tag: { x: number; label: string } | null;
  regens: RegenLine[];
  events: EventMark[];
}

/** Ile torów dla mezocykli — dalej tory są używane ponownie (gałęzie nie nachodzą na siebie w czasie). */
const MESO_LANES = 3;

export function weekX(week: number): number {
  return PAD_L + (week - 1) * COL_W;
}

export function layoutPlan(
  plan: TrainingPlan,
  weeks: WeekRef[],
  status: Record<string, SessionStatus>,
  history: { regens?: RegenMark[]; events?: PlanEvent[] } = {},
): GraphLayout {
  const mainY = PAD_T;
  const mesos = [...new Map(weeks.map((w) => [w.meso.id, w.meso])).values()];
  const laneOf = new Map(mesos.map((m, i) => [m.id, 1 + (i % MESO_LANES)]));
  const usedMesoLanes = Math.min(mesos.length, MESO_LANES);
  const goalLane0 = 1 + usedMesoLanes;
  const laneY = (lane: number) => mainY + lane * LANE_H;
  const last = weeks.length ? weeks[weeks.length - 1].micro.week : 1;

  const nodes: GraphNode[] = weeks.map(({ meso, micro }) => {
    const keys = micro.sessions.map((s, i) => sessionKey(micro.week, s, i));
    const done = keys.filter((k) => status[k] === 'done').length;
    const skipped = keys.filter((k) => status[k] === 'skipped').length;
    const kind: GraphNode['kind'] = micro.isDeload || meso.focus === 'deload' ? 'deload' : meso.focus === 'taper' ? 'taper' : 'week';
    const lane = laneOf.get(meso.id)!;
    return {
      week: micro.week,
      x: weekX(micro.week),
      y: laneY(lane),
      lane,
      color: FOCUS_COLORS[kind === 'deload' ? 'deload' : meso.focus],
      kind,
      intensity: clamp(micro.intensityIndex),
      mesoId: meso.id,
      done,
      skipped,
      total: keys.length,
      highCarb: micro.nutrition.highCarbDays.length,
      tooltip:
        `W${micro.week} · ${meso.name} (${FOCUS_LABELS[meso.focus]})${micro.isDeload ? ' · deload' : ''}\n` +
        `objętość ${Math.round(micro.volumeIndex * 100)}% · intensywność ${Math.round(micro.intensityIndex * 100)}%\n` +
        `kcal ${micro.nutrition.trainingDay.kcal}/${micro.nutrition.restDay.kcal} · sen ${micro.recovery.sleepH} h · ${micro.sessions.length} sesji` +
        (done ? ` · ✓ ${done}/${keys.length}` : ''),
    };
  });

  const edges: GraphEdge[] = [];
  const mesoLabels: MesoLabel[] = [];
  // main: od pierwszego do ostatniego tygodnia (+ pół kolumny na tag).
  edges.push({ d: `M ${weekX(1) - COL_W / 2} ${mainY} H ${weekX(last) + COL_W * 0.75}`, color: 'var(--phase-main)', width: 2.5, mesoId: 'main' });

  for (const meso of mesos) {
    const own = nodes.filter((n) => n.mesoId === meso.id);
    if (!own.length) continue;
    const first = own[0];
    const end = own[own.length - 1];
    const color = FOCUS_COLORS[meso.focus];
    mesoLabels.push({ x: first.x - 4, y: first.y + 21, label: meso.name, color, mesoId: meso.id });
    // fork: z main (pół kolumny przed pierwszym tygodniem) w dół na tor gałęzi
    edges.push({ d: curve(first.x - COL_W / 2, mainY, first.x, first.y), color, width: 2, mesoId: meso.id });
    // commity na gałęzi: grubość = objętość tygodnia (średnia sąsiednich)
    for (let i = 1; i < own.length; i++) {
      const a = weeks.find((w) => w.micro.week === own[i - 1].week)!.micro.volumeIndex;
      const b = weeks.find((w) => w.micro.week === own[i].week)!.micro.volumeIndex;
      edges.push({ d: `M ${own[i - 1].x} ${own[i - 1].y} H ${own[i].x}`, color, width: 1.5 + ((a + b) / 2) * 6, mesoId: meso.id });
    }
    // merge: z ostatniego tygodnia z powrotem do main
    edges.push({ d: curve(end.x, end.y, end.x + COL_W / 2, mainY), color, width: 2, mesoId: meso.id });
  }

  const lanes: GraphLane[] = [{ y: mainY, label: plan.macrocycles[0]?.name ?? 'makrocykl', color: 'var(--phase-main)', id: 'main', kind: 'main' }];
  for (let l = 1; l <= usedMesoLanes; l++) {
    const names = mesos.filter((m) => laneOf.get(m.id) === l).map((m) => PHASE_LABELS[m.focus]);
    lanes.push({ y: laneY(l), label: [...new Set(names)].join(' / '), color: 'var(--app-muted)', id: `lane-${l}`, kind: 'meso' });
  }

  const goalMarks: GoalMark[] = [];
  plan.secondaryGoals.forEach((g, gi) => {
    const y = laneY(goalLane0 + gi);
    lanes.push({ y, label: g.goal, color: 'var(--phase-side)', id: `goal-${gi}`, kind: 'goal' });
    edges.push({ d: `M ${weekX(1)} ${y} H ${weekX(last)}`, color: 'var(--phase-side)', width: 1.5, mesoId: `goal-${gi}`, dashed: true });
    const milestones = new Map(g.milestones.map((m) => [m.week, m.target]));
    for (let w = 1; w <= last; w++) {
      const target = milestones.get(w);
      goalMarks.push({ x: weekX(w), y, label: target ? `W${w}: ${target}` : '', milestone: !!target });
    }
  });

  const comp = plan.meta.competitionDate;
  const tag = comp ? { x: weekX(last) + COL_W * 0.75, label: 'START' } : null;
  const laneCount = goalLane0 + plan.secondaryGoals.length;

  const regens: RegenLine[] = (history.regens ?? []).map((r) => ({
    x: weekX(Math.min(Math.max(r.week, 1), last)) - COL_W / 2,
    label: r.kind === 'full' ? '↻ nowy plan' : `↻ W${r.week}+`,
    kind: r.kind,
    tooltip: `${r.kind === 'full' ? 'Przegenerowano cały plan' : `Korekta od W${r.week}`} · ${r.at.slice(0, 10)} · ${r.label} · wynik zdarzeń ${r.score}`,
  }));
  const byWeek = new Map<number, PlanEvent[]>();
  for (const e of history.events ?? []) {
    const w = Math.min(Math.max(e.week, 1), last);
    byWeek.set(w, [...(byWeek.get(w) ?? []), e]);
  }
  const events: EventMark[] = [...byWeek.entries()].map(([w, list]) => ({
    x: weekX(w),
    count: list.length,
    severity: Math.max(...list.map((e) => e.severity)) as 1 | 2 | 3,
    tooltip: list.map((e) => `${e.at.slice(0, 10)} ${EVENT_TYPES[e.type].label} (${e.severity})${e.note ? ` — ${e.note}` : ''}`).join('\n'),
  }));

  return {
    regens,
    events,
    width: weekX(last) + COL_W * 1.6 + (tag ? 40 : 0),
    // + pas na znaczniki zdarzeń pod torami
    height: laneY(laneCount - 1) + LANE_H + (events.length ? 22 : 0),
    nodes,
    edges,
    lanes,
    goalMarks,
    weeks: weeks.map((w) => ({ week: w.micro.week, x: weekX(w.micro.week), date: weekDate(plan.meta.startDate, w.micro.week) })),
    mesoLabels,
    mainY,
    tag,
  };
}

/** Poniedziałek tygodnia jako „dd.MM" (UTC — bez przesunięć strefy). */
export function weekDate(startIso: string, week: number): string {
  const t = Date.parse(startIso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + (week - 1) * 7 * 864e5);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Łuk fork/merge jak w git graph (kubiczna krzywa Béziera). */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}
