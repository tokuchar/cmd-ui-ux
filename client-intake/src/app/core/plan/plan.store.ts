import { computed, effect, Injectable, signal } from '@angular/core';
import { allWeeks, Microcycle, PlanNutrition, Session, sessionKey, TrainingPlan, WeekRef } from '../models/plan.model';
import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-store';
import { EventType } from '../config/events.config';
import { PlanEvent, RegenMark } from './events';
import { DailyLog } from './stats';
import { applyPatch, normalizePlan } from '../validation/plan.validator';

/** Wpis z `zaloguj squat 180x3@8`. */
export interface LogEntry {
  at: string;
  week: number;
  lift: string;
  kg: number;
  reps: number;
  rpe: number | null;
  e1rm: number | null;
}

/** Wersja planu = „commit" (każdy import / korekta). */
export interface PlanVersion {
  at: string;
  label: string;
  plan: TrainingPlan;
}

export type SessionStatus = 'done' | 'skipped';

interface PlanState {
  status: Record<string, SessionStatus>;
  /** Lokalne zmiany sesji (zamiana ćwiczenia, przesunięcie dnia, skrócenie). */
  edits: Record<string, Session>;
}

const EMPTY_STATE: PlanState = { status: {}, edits: {} };

/**
 * Stan widoku planu (signals + localStorage). Plan z AI jest niezmienny — lokalne zmiany
 * trenera trzymane są obok (`edits`) i nakładane przy odczycie, żeby korekta AI ich nie gubiła po cichu.
 */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  readonly plan = signal<TrainingPlan | null>(loadPlan());
  readonly history = signal<PlanVersion[]>(readJson<PlanVersion[]>(STORAGE_KEYS.planHistory) ?? []);
  readonly log = signal<LogEntry[]>(readJson<LogEntry[]>(STORAGE_KEYS.log) ?? []);
  readonly state = signal<PlanState>({ ...EMPTY_STATE, ...(readJson<PlanState>(`${STORAGE_KEYS.plan}-state`) ?? {}) });
  /** Zdarzenia w trakcie planu (kontuzja, choroba, sen…) — podstawa oceny „czy przegenerować". */
  readonly events = signal<PlanEvent[]>(readJson<PlanEvent[]>(STORAGE_KEYS.events) ?? []);
  /** Przegenerowania planu (import / korekta) — znaczniki na grafie. */
  readonly regens = signal<RegenMark[]>(readJson<RegenMark[]>(STORAGE_KEYS.regens) ?? []);
  /** Dzienne logi: makro, waga, sen, cardio. */
  readonly daily = signal<DailyLog[]>(readJson<DailyLog[]>(STORAGE_KEYS.daily) ?? []);

  /** Zaznaczony tydzień w grafie (null = bieżący tydzień). */
  readonly selectedWeek = signal<number | null>(null);
  /** Otwarta sesja w szufladzie. */
  readonly openSession = signal<string | null>(null);
  /** Podświetlona gałąź (mezocykl / cel dodatkowy). */
  readonly highlight = signal<string | null>(null);

  readonly weeks = computed<WeekRef[]>(() => {
    const p = this.plan();
    if (!p) return [];
    const edits = this.state().edits;
    return allWeeks(p).map((ref) => ({
      ...ref,
      micro: { ...ref.micro, sessions: ref.micro.sessions.map((s, i) => edits[sessionKey(ref.micro.week, s, i)] ?? s) },
    }));
  });

  /** Bieżący tydzień od startDate (1…N, przycięty do planu). */
  readonly head = computed(() => {
    const p = this.plan();
    if (!p) return 1;
    return currentWeek(p.meta.startDate, this.weeks().length);
  });

  readonly current = computed(() => this.selectedWeek() ?? this.head());
  readonly currentRef = computed(() => this.weeks().find((w) => w.micro.week === this.current()) ?? null);

  constructor() {
    effect(() => writeJson(STORAGE_KEYS.plan, this.plan()));
    effect(() => writeJson(STORAGE_KEYS.planHistory, this.history()));
    effect(() => writeJson(STORAGE_KEYS.log, this.log()));
    effect(() => writeJson(`${STORAGE_KEYS.plan}-state`, this.state()));
    effect(() => writeJson(STORAGE_KEYS.events, this.events()));
    effect(() => writeJson(STORAGE_KEYS.regens, this.regens()));
    effect(() => writeJson(STORAGE_KEYS.daily, this.daily()));
  }

  /** Nowy plan (import z AI / demo). Poprzedni trafia do historii; `score` = wynik zdarzeń (znacznik ↻). */
  setPlan(plan: TrainingPlan, label: string, score = 0): void {
    const regenerated = !!this.plan();
    this.commit(plan, label);
    // Nowy plan zaczyna od zera: znaczniki tylko w obrębie jednego planu (pierwszy import to nie przegenerowanie).
    this.regens.set(regenerated ? [{ at: new Date().toISOString(), week: 1, kind: 'full', label, score }] : []);
    this.state.set(EMPTY_STATE);
    this.selectedWeek.set(null);
    this.openSession.set(null);
  }

  /** Korekta AI: podmiana tygodni, statusy i lokalne zmiany wcześniejszych tygodni zostają. */
  applyCorrection(patch: Microcycle[], label: string, score = 0, nutrition?: Partial<PlanNutrition>): void {
    const p = this.plan();
    if (!p) return;
    const next = applyPatch(p, patch);
    this.commit(nutrition ? { ...next, nutrition: { ...next.nutrition, ...nutrition } } : next, label);
    const week = patch.length ? Math.min(...patch.map((w) => w.week)) : this.head();
    this.regens.update((r) => [...r, { at: new Date().toISOString(), week, kind: 'patch', label, score }]);
    const weeks = new Set(patch.map((w) => w.week));
    this.state.update((s) => ({
      ...s,
      edits: Object.fromEntries(Object.entries(s.edits).filter(([k]) => !weeks.has(weekOfKey(k)))),
    }));
  }

  /** Powrót do wersji z historii (`cofnij`). */
  revert(index: number): boolean {
    const v = this.history()[index];
    if (!v) return false;
    this.plan.set(normalizePlan(v.plan));
    this.history.update((h) => h.slice(0, index));
    return true;
  }

  clear(): void {
    this.plan.set(null);
    this.state.set(EMPTY_STATE);
  }

  setStatus(key: string, status: SessionStatus | null): void {
    this.state.update((s) => {
      const next = { ...s.status };
      if (status) next[key] = status;
      else delete next[key];
      return { ...s, status: next };
    });
  }

  editSession(key: string, session: Session): void {
    this.state.update((s) => ({ ...s, edits: { ...s.edits, [key]: session } }));
  }

  addEvent(type: EventType, severity: 1 | 2 | 3, note: string, auto = false): PlanEvent {
    const event: PlanEvent = { id: `${Date.now()}-${this.events().length}`, at: new Date().toISOString(), week: this.head(), type, severity, note, auto };
    this.events.update((e) => [...e, event]);
    return event;
  }

  /** Dopisuje dane do logu dnia (dziś). */
  logDay(patch: Partial<Omit<DailyLog, 'date'>>, date = new Date().toISOString().slice(0, 10)): DailyLog {
    const cur = this.daily().find((d) => d.date === date) ?? { date };
    const next: DailyLog = { ...cur, ...patch, cardio: patch.cardio ? [...(cur.cardio ?? []), ...patch.cardio] : cur.cardio };
    this.daily.update((list) => [...list.filter((d) => d.date !== date), next].sort((a, b) => a.date.localeCompare(b.date)));
    return next;
  }

  addLog(entry: LogEntry): void {
    this.log.update((l) => [...l, entry]);
  }

  /** Najnowsze e1RM z logów dla boju (nadpisuje baseline z profilu). */
  latestE1rm(lift: string): number | null {
    const hits = this.log().filter((l) => l.lift === lift && l.e1rm);
    return hits.length ? hits[hits.length - 1].e1rm : null;
  }

  private commit(plan: TrainingPlan, label: string): void {
    const prev = this.plan();
    if (prev) this.history.update((h) => [...h, { at: new Date().toISOString(), label: prev.meta.goal, plan: prev }].slice(-10));
    this.plan.set({ ...plan, meta: { ...plan.meta, notes: [...(plan.meta.notes ?? []), `${label} · ${new Date().toLocaleString('pl-PL')}`] } });
  }
}

function loadPlan(): TrainingPlan | null {
  const stored = readJson<TrainingPlan>(STORAGE_KEYS.plan);
  return stored ? normalizePlan(stored) : null;
}

export function currentWeek(startIso: string, total: number, now = Date.now()): number {
  const w = Math.floor((now - Date.parse(startIso)) / (7 * 864e5)) + 1;
  return Math.min(Math.max(w, 1), Math.max(total, 1));
}

function weekOfKey(key: string): number {
  return Number(/^w(\d+)-/.exec(key)?.[1] ?? 0);
}
