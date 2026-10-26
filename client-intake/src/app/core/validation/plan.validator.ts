import { compileFormula, FormulaError } from '../domain/formula';
import { normalize } from '../engine/text';
import { hasInjuryDecision, injuryFor, isSevere } from '../domain/injuries';
import { Injury } from '../models/athlete.model';
import { DAY_CODES, ExerciseBlock, LOAD_METHODS, Microcycle, PHASE_FOCI, PlanNutrition, TIP_CATEGORIES, TrainingPlan } from '../models/plan.model';

/**
 * Walidacja JSON-a z AI (bez bibliotek). Zwraca listę problemów ze ścieżką (`macrocycles[0].mesocycles[1].focus`),
 * żeby trener mógł poprawić odpowiedź albo poprosić AI o poprawkę konkretnego miejsca.
 *  - error   → planu nie da się wyrenderować,
 *  - warning → plan działa, ale coś jest podejrzane (dziura w tygodniach, brak deloadu…).
 */
export interface PlanIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export type PlanImport =
  | { kind: 'plan'; plan: TrainingPlan; issues: PlanIssue[] }
  | { kind: 'patch'; microcycles: Microcycle[]; nutrition?: Partial<PlanNutrition>; issues: PlanIssue[] }
  | { kind: 'invalid'; issues: PlanIssue[] };

type Obj = Record<string, unknown>;

/** Kontekst walidacji: kontuzje z profilu (ostrzeżenie, gdy AI nie podjęło decyzji dla ćwiczenia). */
export interface PlanCheckOptions {
  injuries?: Injury[];
  /** Choroby / leki z profilu — przy nadciśnieniu, arytmii itp. kofeina wymaga adnotacji. */
  health?: string | null;
}

/** Stany, przy których dawka kofeiny wymaga uzasadnienia (skipWhen / notes). */
const CAFFEINE_RISK = /nadcisn|cisnien|arytm|serc|lek|panik|ciaz|reflux|refluks|bezsenn/;

const TEMPO_RE = /^[0-9X]{4}$/i;

class Checker {
  readonly issues: PlanIssue[] = [];

  constructor(private readonly opts: PlanCheckOptions = {}) {}

  error(path: string, message: string): void {
    this.issues.push({ path, message, severity: 'error' });
  }

  warn(path: string, message: string): void {
    this.issues.push({ path, message, severity: 'warning' });
  }

  obj(v: unknown, path: string): Obj | null {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Obj;
    this.error(path, 'Oczekiwano obiektu.');
    return null;
  }

  arr(v: unknown, path: string, optional = false): unknown[] {
    if (Array.isArray(v)) return v;
    if (optional && v === undefined) return [];
    this.error(path, 'Oczekiwano tablicy.');
    return [];
  }

  str(o: Obj, key: string, path: string, optional = false): void {
    const v = o[key];
    if (optional && (v === undefined || v === null)) return;
    if (typeof v !== 'string' || (!optional && v.trim() === '')) this.error(`${path}.${key}`, 'Oczekiwano tekstu.');
  }

  num(o: Obj, key: string, path: string, opts: { min?: number; max?: number; optional?: boolean } = {}): void {
    const v = o[key];
    if (opts.optional && (v === undefined || v === null)) return;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.error(`${path}.${key}`, 'Oczekiwano liczby.');
      return;
    }
    if ((opts.min !== undefined && v < opts.min) || (opts.max !== undefined && v > opts.max)) {
      this.error(`${path}.${key}`, `Wartość ${v} poza zakresem ${opts.min ?? '-∞'}…${opts.max ?? '∞'}.`);
    }
  }

  oneOf(o: Obj, key: string, allowed: readonly string[], path: string, optional = false): void {
    const v = o[key];
    if (optional && (v === undefined || v === null)) return;
    if (!allowed.includes(v as string)) this.error(`${path}.${key}`, `Dozwolone: ${allowed.join(', ')} (jest: ${JSON.stringify(v)}).`);
  }

  isoDate(o: Obj, key: string, path: string, optional = false): void {
    const v = o[key];
    if (optional && (v === undefined || v === null || v === '')) return;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v) || Number.isNaN(Date.parse(v))) {
      this.error(`${path}.${key}`, 'Oczekiwano daty ISO RRRR-MM-DD.');
    }
  }

  macros(v: unknown, path: string): void {
    const m = this.obj(v, path);
    if (!m) return;
    this.num(m, 'kcal', path, { min: 800, max: 8000 });
    for (const k of ['protein', 'carbs', 'fat']) this.num(m, k, path, { min: 0, max: 1000 });
  }

  drills(v: unknown, path: string): void {
    this.arr(v, path, true).forEach((d, i) => {
      const o = this.obj(d, `${path}[${i}]`);
      if (o) this.str(o, 'name', `${path}[${i}]`);
    });
  }

  exercises(v: unknown, path: string): void {
    this.arr(v, path, true).forEach((e, i) => {
      const p = `${path}[${i}]`;
      const o = this.obj(e, p);
      if (!o) return;
      this.str(o, 'exercise', p);
      this.num(o, 'sets', p, { min: 1, max: 20 });
      if (typeof o['reps'] !== 'string' && typeof o['reps'] !== 'number') this.error(`${p}.reps`, 'Oczekiwano liczby lub tekstu (np. "8-10").');
      this.oneOf(o, 'lift', ['squat', 'bench', 'deadlift', 'ohp'], p, true);
      const load = this.obj(o['load'], `${p}.load`);
      if (!load) return;
      if (!('method' in load) && 'type' in load) upgradeLegacy(o, load);
      this.oneOf(load, 'method', LOAD_METHODS, `${p}.load`);
      if (load['method'] === 'pct') this.num(load, 'value', `${p}.load`, { min: 10, max: 110 });
      if (load['method'] === 'kg') this.num(load, 'value', `${p}.load`, { min: 0, max: 1000, optional: true });
      if (load['method'] === 'formula') {
        if (typeof load['expr'] !== 'string') this.error(`${p}.load.expr`, 'Metoda "formula" wymaga pola expr (np. "min(e1rm * 0.6, 80)").');
        else {
          try {
            compileFormula(load['expr']);
          } catch (err) {
            this.error(`${p}.load.expr`, `Błędny wzór: ${err instanceof FormulaError ? err.message : String(err)}.`);
          }
        }
      }
      this.num(load, 'adjustPct', `${p}.load`, { min: -90, max: 30, optional: true });
      this.num(load, 'maxKg', `${p}.load`, { min: 0, max: 1000, optional: true });
      this.num(o, 'rir', p, { min: 0, max: 10, optional: true });
      if (o['rir'] === undefined && load['method'] === 'rts') this.warn(`${p}.rir`, 'Metoda "rts" bez RIR — przyjmuję RIR 2.');
      if (o['tempo'] === undefined) this.warn(`${p}.tempo`, 'Brak tempa (np. "20X1").');
      else if (typeof o['tempo'] !== 'string' || !TEMPO_RE.test(o['tempo'])) this.warn(`${p}.tempo`, `Tempo w formacie 4 znaków, np. "20X1" (jest: ${JSON.stringify(o['tempo'])}).`);

      const injury = this.opts.injuries?.length ? injuryFor(o as unknown as ExerciseBlock, this.opts.injuries) : null;
      if (injury && !hasInjuryDecision(o as unknown as ExerciseBlock)) {
        this.warn(p, `Brak decyzji dla kontuzji „${injury.nazwa}"${isSevere(injury) ? ' (poważna)' : ''}: ${String(o['exercise'])} — dodaj injuryNote / adjustPct / maxKg albo zamień ćwiczenie.`);
      }
    });
  }

  fueling(v: unknown, path: string): void {
    if (v === undefined) return;
    const f = this.obj(v, path);
    if (!f) return;
    for (const k of ['pre', 'intra', 'post']) this.str(f, k, path, true);
    this.num(f, 'caffeineMg', path, { min: 0, max: 600, optional: true });
  }

  nutritionExtras(n: Obj): void {
    if (n['caffeine'] !== undefined) {
      const c = this.obj(n['caffeine'], 'nutrition.caffeine');
      if (c) {
        this.num(c, 'preWorkoutMg', 'nutrition.caffeine', { min: 0, max: 600 });
        this.num(c, 'minutesBefore', 'nutrition.caffeine', { min: 0, max: 180 });
        this.num(c, 'dailyMaxMg', 'nutrition.caffeine', { min: 0, max: 800 });
        this.num(c, 'cutoffHoursBeforeSleep', 'nutrition.caffeine', { min: 0, max: 16 });
        const pre = Number(c['preWorkoutMg']);
        const max = Number(c['dailyMaxMg']);
        if (max > 400) this.warn('nutrition.caffeine.dailyMaxMg', `${max} mg/dzień — powyżej 400 mg (limit EFSA dla zdrowych dorosłych).`);
        if (pre > max) this.warn('nutrition.caffeine.preWorkoutMg', 'Dawka przedtreningowa większa niż limit dzienny.');
        if (pre > 0 && this.opts.health && CAFFEINE_RISK.test(normalize(this.opts.health)) && !(Array.isArray(c['skipWhen']) && c['skipWhen'].length) && !(Array.isArray(c['notes']) && c['notes'].length)) {
          this.warn('nutrition.caffeine', `Profil: „${this.opts.health}" — dodaj skipWhen / notes, kiedy ograniczyć kofeinę.`);
        }
      }
    }
    this.fueling(n['periWorkout'], 'nutrition.periWorkout');
    this.arr(n['tips'], 'nutrition.tips', true).forEach((t, i) => {
      const p = `nutrition.tips[${i}]`;
      const o = this.obj(t, p);
      if (!o) return;
      this.str(o, 'title', p);
      this.str(o, 'text', p);
      if (!TIP_CATEGORIES.includes(o['category'] as never)) this.warn(`${p}.category`, `Kategoria spoza: ${TIP_CATEGORIES.join(', ')}.`);
    });
  }

  microcycle(v: unknown, path: string): void {
    const w = this.obj(v, path);
    if (!w) return;
    this.num(w, 'week', path, { min: 1, max: 104 });
    if (typeof w['isDeload'] !== 'boolean') this.error(`${path}.isDeload`, 'Oczekiwano true/false.');
    this.num(w, 'volumeIndex', path, { min: 0, max: 1 });
    this.num(w, 'intensityIndex', path, { min: 0, max: 1 });
    const n = this.obj(w['nutrition'], `${path}.nutrition`);
    if (n) {
      this.macros(n['trainingDay'], `${path}.nutrition.trainingDay`);
      this.macros(n['restDay'], `${path}.nutrition.restDay`);
      this.arr(n['highCarbDays'], `${path}.nutrition.highCarbDays`, true).forEach((d, i) => {
        if (!DAY_CODES.includes(d as never)) this.error(`${path}.nutrition.highCarbDays[${i}]`, `Dzień spoza ${DAY_CODES.join('/')}.`);
      });
    }
    const r = this.obj(w['recovery'], `${path}.recovery`);
    if (r) {
      this.num(r, 'sleepH', `${path}.recovery`, { min: 4, max: 12 });
      this.num(r, 'steps', `${path}.recovery`, { min: 0, max: 40000 });
    }
    this.arr(w['cardio'], `${path}.cardio`, true).forEach((c, i) => {
      const p = `${path}.cardio[${i}]`;
      const o = this.obj(c, p);
      if (!o) return;
      this.oneOf(o, 'day', DAY_CODES, p);
      this.str(o, 'type', p);
      this.num(o, 'minutes', p, { min: 1, max: 600 });
    });
    const sessions = this.arr(w['sessions'], `${path}.sessions`);
    sessions.forEach((s, i) => {
      const p = `${path}.sessions[${i}]`;
      const o = this.obj(s, p);
      if (!o) return;
      this.oneOf(o, 'day', DAY_CODES, p);
      this.str(o, 'name', p);
      this.num(o, 'durationMin', p, { min: 10, max: 300 });
      this.drills(o['warmup'], `${p}.warmup`);
      this.drills(o['prehab'], `${p}.prehab`);
      this.exercises(o['main'], `${p}.main`);
      this.exercises(o['accessories'], `${p}.accessories`);
      this.drills(o['cooldown'], `${p}.cooldown`);
      this.fueling(o['fueling'], `${p}.fueling`);
    });
  }
}

/** Usuwa ```json … ``` i tekst wokół obiektu — AI często opakowuje odpowiedź. */
export function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

/** Tekst wklejony z AI → plan, patch tygodni albo lista błędów. */
export function parsePlanImport(raw: string, opts: PlanCheckOptions = {}): PlanImport {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (e) {
    return { kind: 'invalid', issues: [{ path: '(json)', message: `To nie jest poprawny JSON: ${(e as Error).message}`, severity: 'error' }] };
  }
  const c = new Checker(opts);
  const root = c.obj(data, '(root)');
  if (!root) return { kind: 'invalid', issues: c.issues };

  if (!('macrocycles' in root) && ('microcycles' in root || 'microcycle' in root || 'nutrition' in root)) {
    const list = Array.isArray(root['microcycles']) ? root['microcycles'] : 'microcycle' in root ? [root['microcycle']] : [];
    list.forEach((w, i) => c.microcycle(w, `microcycles[${i}]`));
    const nutrition = root['nutrition'] === undefined ? undefined : c.obj(root['nutrition'], 'nutrition');
    if (nutrition) {
      if (nutrition['baseline'] !== undefined) c.macros(nutrition['baseline'], 'nutrition.baseline');
      c.nutritionExtras(nutrition);
    }
    const errors = c.issues.some((i) => i.severity === 'error');
    return errors
      ? { kind: 'invalid', issues: c.issues }
      : { kind: 'patch', microcycles: list as Microcycle[], nutrition: (nutrition ?? undefined) as Partial<PlanNutrition> | undefined, issues: c.issues };
  }

  const meta = c.obj(root['meta'], 'meta');
  if (meta) {
    c.str(meta, 'athlete', 'meta', true);
    c.isoDate(meta, 'startDate', 'meta');
    c.num(meta, 'horizonWeeks', 'meta', { min: 1, max: 104 });
    c.str(meta, 'goal', 'meta');
    c.isoDate(meta, 'competitionDate', 'meta', true);
  }
  const nutrition = c.obj(root['nutrition'], 'nutrition');
  if (nutrition) {
    c.num(nutrition, 'tdee', 'nutrition', { min: 800, max: 8000 });
    c.macros(nutrition['baseline'], 'nutrition.baseline');
    c.nutritionExtras(nutrition);
    if (!nutrition['caffeine']) c.warn('nutrition.caffeine', 'Brak strategii kofeiny.');
    if (!Array.isArray(nutrition['tips']) || !nutrition['tips'].length) c.warn('nutrition.tips', 'Brak porad żywieniowych.');
  }
  const weeks: number[] = [];
  const macros = c.arr(root['macrocycles'], 'macrocycles');
  if (!macros.length) c.error('macrocycles', 'Plan musi mieć co najmniej jeden makrocykl.');
  macros.forEach((m, mi) => {
    const mp = `macrocycles[${mi}]`;
    const macro = c.obj(m, mp);
    if (!macro) return;
    c.str(macro, 'name', mp);
    const mesos = c.arr(macro['mesocycles'], `${mp}.mesocycles`);
    mesos.forEach((x, xi) => {
      const xp = `${mp}.mesocycles[${xi}]`;
      const meso = c.obj(x, xp);
      if (!meso) return;
      c.str(meso, 'name', xp);
      c.oneOf(meso, 'focus', PHASE_FOCI, xp);
      c.num(meso, 'kcalAdjust', xp, { min: -1500, max: 1500 });
      c.num(meso, 'sleepTargetH', xp, { min: 5, max: 12 });
      c.arr(meso['microcycles'], `${xp}.microcycles`).forEach((w, wi) => {
        c.microcycle(w, `${xp}.microcycles[${wi}]`);
        const week = (w as Obj | null)?.['week'];
        if (typeof week === 'number') weeks.push(week);
      });
    });
  });
  c.arr(root['secondaryGoals'], 'secondaryGoals', true);

  // Ostrzeżenia logiczne — plan się wyrenderuje, ale warto dopytać AI.
  const sorted = [...weeks].sort((a, b) => a - b);
  const dupes = sorted.filter((w, i) => sorted[i - 1] === w);
  if (dupes.length) c.error('macrocycles', `Powtórzone numery tygodni: ${[...new Set(dupes)].join(', ')}.`);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > 1) c.warn('macrocycles', `Brak tygodni ${sorted[i - 1] + 1}–${sorted[i] - 1}.`);
  }
  const horizon = meta?.['horizonWeeks'];
  if (typeof horizon === 'number' && sorted.length && sorted[sorted.length - 1] !== horizon) {
    c.warn('meta.horizonWeeks', `horizonWeeks = ${horizon}, a ostatni tydzień planu to ${sorted[sorted.length - 1]}.`);
  }
  if (sorted.length >= 7 && !hasDeload(macros)) c.warn('macrocycles', 'Plan dłuższy niż 6 tygodni bez deloadu.');

  const errors = c.issues.some((i) => i.severity === 'error');
  return errors ? { kind: 'invalid', issues: c.issues } : { kind: 'plan', plan: root as unknown as TrainingPlan, issues: c.issues };
}

/** Stary format `{ type: rpe|pct|kg, value }` → `{ method, value }` + RIR (RPE 8 → RIR 2). Mutuje sparsowany JSON. */
function upgradeLegacy(exercise: Record<string, unknown>, load: Record<string, unknown>): void {
  const type = load['type'];
  delete load['type'];
  if (type === 'rpe') {
    load['method'] = 'rts';
    if (exercise['rir'] === undefined && typeof load['value'] === 'number') exercise['rir'] = Math.max(0, 10 - load['value']);
    delete load['value'];
  } else load['method'] = type;
}

/** Plan zapisany w starszym formacie (localStorage) → bieżący kontrakt. */
export function normalizePlan(plan: TrainingPlan): TrainingPlan {
  for (const macro of plan.macrocycles) {
    for (const meso of macro.mesocycles) {
      for (const week of meso.microcycles) {
        for (const s of week.sessions) {
          for (const b of [...s.main, ...s.accessories] as unknown as Record<string, unknown>[]) {
            const load = b['load'] as Record<string, unknown> | undefined;
            if (load && !('method' in load) && 'type' in load) upgradeLegacy(b, load);
          }
        }
      }
    }
  }
  return plan;
}

function hasDeload(macros: unknown[]): boolean {
  return JSON.stringify(macros).includes('"isDeload":true') || JSON.stringify(macros).includes('"focus":"deload"');
}

/** Podmiana tygodni z patcha korekty (po numerze tygodnia). */
export function applyPatch(plan: TrainingPlan, patch: Microcycle[]): TrainingPlan {
  const byWeek = new Map(patch.map((w) => [w.week, w]));
  return {
    ...plan,
    macrocycles: plan.macrocycles.map((macro) => ({
      ...macro,
      mesocycles: macro.mesocycles.map((meso) => ({
        ...meso,
        microcycles: meso.microcycles.map((w) => byWeek.get(w.week) ?? w),
      })),
    })),
  };
}
