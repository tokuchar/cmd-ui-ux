/**
 * Kontrakt planu treningowego generowanego przez AI (JSON). Opis pól: docs/PLAN-SCHEMA.md,
 * przykład: docs/samples/plan.example.json. Walidacja: core/validation/plan.validator.ts.
 *
 * Tygodnie są numerowane globalnie (1…horizonWeeks) przez cały plan — po nich rysowany jest
 * graf makrocyklu i wyliczany bieżący tydzień („dziś", od meta.startDate).
 */
export interface TrainingPlan {
  meta: PlanMeta;
  nutrition: PlanNutrition;
  macrocycles: Macrocycle[];
  /** Cele dodatkowe jako gałęzie równoległe (półmaraton, handstand…). */
  secondaryGoals: SecondaryGoalTrack[];
}

export interface PlanMeta {
  version: '1';
  athlete: string;
  generatedAt: string;
  /** ISO poniedziałku tygodnia 1. */
  startDate: string;
  horizonWeeks: number;
  goal: string;
  /** ISO dnia zawodów / testu (tag na grafie). */
  competitionDate?: string | null;
  notes: string[];
}

export interface PlanNutrition {
  tdee: number;
  baseline: Macros;
  rules: string[];
  /** Strategia kofeiny (dawka okołotreningowa, limit dzienny, godzina graniczna przed snem). */
  caffeine?: CaffeinePlan;
  /** Posiłki okołotreningowe — domyślne dla planu (sesja może nadpisać w `fueling`). */
  periWorkout?: Fueling;
  /** Porady żywieniowe: faza (redukcja / rekompozycja / utrzymanie / masa), zdrowie, nawodnienie… */
  tips?: NutritionTip[];
}

export interface CaffeinePlan {
  /** Dawka przed treningiem (mg) i ile minut przed. */
  preWorkoutMg: number;
  minutesBefore: number;
  /** Górny limit dzienny (mg) — z uwzględnieniem kawy. */
  dailyMaxMg: number;
  /** Ostatnia kofeina najpóźniej X h przed snem. */
  cutoffHoursBeforeSleep: number;
  /** Kiedy pominąć / zmniejszyć (deload, wieczorny trening, ciśnienie, słaby sen…). */
  skipWhen?: string[];
  notes?: string[];
}

export interface Fueling {
  /** Np. „2–3 h przed: 40–60 g węgli + 30 g białka". */
  pre?: string;
  intra?: string;
  post?: string;
  /** Kofeina na tę sesję (mg); 0 = bez kofeiny. */
  caffeineMg?: number;
}

export const TIP_CATEGORIES = ['faza', 'zdrowie', 'okolotreningowo', 'nawodnienie', 'suplementacja', 'sen', 'nawyki'] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];

export interface NutritionTip {
  category: TipCategory;
  title: string;
  text: string;
  /** 1 = najważniejsze. */
  priority?: 1 | 2 | 3;
  /** Zakres tygodni, w których porada obowiązuje (np. [12, 14] — taper). */
  weeks?: [number, number];
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Macrocycle {
  id: string;
  name: string;
  goal: string;
  mesocycles: Mesocycle[];
}

export const PHASE_FOCI = ['accumulation', 'hypertrophy', 'intensification', 'realization', 'deload', 'taper'] as const;
export type PhaseFocus = (typeof PHASE_FOCI)[number];

export interface Mesocycle {
  id: string;
  name: string;
  focus: PhaseFocus;
  notes?: string;
  /** Korekta kcal względem baseline (np. -300). */
  kcalAdjust: number;
  /** Opis strategii węglowodanów („więcej węgli w dni ciężkich przysiadów"). */
  carbStrategy: string;
  sleepTargetH: number;
  microcycles: Microcycle[];
}

export const DAY_CODES = ['pn', 'wt', 'sr', 'cz', 'pt', 'so', 'nd'] as const;
export type DayCode = (typeof DAY_CODES)[number];

export interface Microcycle {
  week: number;
  isDeload: boolean;
  /** 0–1: względna objętość tygodnia (grubość krawędzi grafu). */
  volumeIndex: number;
  /** 0–1: względna intensywność (jasność węzła). */
  intensityIndex: number;
  label?: string;
  nutrition: { trainingDay: Macros; restDay: Macros; highCarbDays: DayCode[]; tips?: string[] };
  recovery: { sleepH: number; steps: number; notes?: string };
  cardio: CardioSession[];
  sessions: Session[];
}

export interface CardioSession {
  day: DayCode;
  type: string;
  minutes: number;
  zone?: string;
  notes?: string;
}

export interface Session {
  day: DayCode;
  name: string;
  focus: string;
  durationMin: number;
  warmup: Drill[];
  prehab: Drill[];
  main: ExerciseBlock[];
  accessories: ExerciseBlock[];
  cooldown: Drill[];
  /** Posiłki okołotreningowe i kofeina dla tej sesji (nadpisują nutrition.periWorkout). */
  fueling?: Fueling;
  notes?: string;
}

export interface Drill {
  name: string;
  sets?: number;
  reps?: string | number;
  durationSec?: number;
  /** Prehab/rehab: której kontuzji / obszaru dotyczy. */
  target?: string;
  notes?: string;
}

export type LiftKey = 'squat' | 'bench' | 'deadlift' | 'ohp';

export interface ExerciseBlock {
  exercise: string;
  /** Bój bazowy, z którego e1RM liczony jest ciężar („sugeruj ciezary"). */
  lift?: LiftKey | null;
  sets: number;
  reps: string | number;
  /** Powtórzenia w zapasie (0 = do upadku technicznego). */
  rir?: number;
  /** 4 cyfry: ekscentryk – pauza na dole – koncentryk – pauza na górze, X = eksplozywnie (np. 20X1). */
  tempo?: string;
  load: Load;
  restSec?: number;
  notes?: string;
  /** Wymagane, gdy ćwiczenie obciąża obszar z kontuzją: co AI zmieniło i dlaczego. */
  injuryNote?: string;
  /** 1 = kluczowe, 3 = do wycięcia przy skracaniu sesji („krocej 45"). */
  priority?: 1 | 2 | 3;
}

export const LOAD_METHODS = ['rts', 'pct', 'kg', 'formula'] as const;
export type LoadMethod = (typeof LOAD_METHODS)[number];

/**
 * Jak liczyć ciężar — decyzja AI dla każdego ćwiczenia:
 *  - rts      → e1RM × tabela RTS (powtórzenia + RIR),
 *  - pct      → e1RM × value %,
 *  - kg       → stały ciężar `value` (np. rehab, maszyna); brak value = bez obciążenia / guma,
 *  - formula  → własny wzór `expr` (zmienne e1rm, reps, rir; min/max).
 * `adjustPct` i `maxKg` korygują wynik (kontuzja, zmęczenie).
 */
export interface Load {
  method: LoadMethod;
  value?: number;
  expr?: string;
  adjustPct?: number;
  maxKg?: number;
  /** Dlaczego ta metoda — pokazywane przy serii. */
  note?: string;
}

export interface SecondaryGoalTrack {
  goal: string;
  type: string;
  milestones: { week: number; target: string }[];
}

/* ---------- Pomocnicze ---------- */

/** Mikrocykl z kontekstem mezocyklu (płaska lista tygodni dla grafu i komend). */
export interface WeekRef {
  macro: Macrocycle;
  meso: Mesocycle;
  micro: Microcycle;
}

export function allWeeks(plan: TrainingPlan): WeekRef[] {
  return plan.macrocycles
    .flatMap((macro) => macro.mesocycles.flatMap((meso) => meso.microcycles.map((micro) => ({ macro, meso, micro }))))
    .sort((a, b) => a.micro.week - b.micro.week);
}

/** Stabilny klucz sesji (status wykonania, logi): `w3-pn-0`. */
export function sessionKey(week: number, s: Session, index: number): string {
  return `w${week}-${s.day}-${index}`;
}

export const DAY_LABELS: Record<DayCode, string> = {
  pn: 'Poniedziałek',
  wt: 'Wtorek',
  sr: 'Środa',
  cz: 'Czwartek',
  pt: 'Piątek',
  so: 'Sobota',
  nd: 'Niedziela',
};

/** Nazwa fazy z odmianą — hipertrofia to akumulacja nastawiona na masę mięśniową. */
export const FOCUS_LABELS: Record<PhaseFocus, string> = {
  accumulation: 'akumulacja',
  hypertrophy: 'akumulacja · hipertrofia',
  intensification: 'intensyfikacja',
  realization: 'realizacja',
  deload: 'deload',
  taper: 'taper',
};

/**
 * Faza periodyzacji blokowej (tory grafu): akumulacja → intensyfikacja → realizacja → taper.
 * Odmiana (hipertrofia) i szczegóły niesie nazwa bloku (Mesocycle.name), nie osobna faza.
 */
export const PHASE_LABELS: Record<PhaseFocus, string> = {
  ...FOCUS_LABELS,
  hypertrophy: 'akumulacja',
};

/** Token koloru fazy (styles/tokens.css). */
export const FOCUS_COLORS: Record<PhaseFocus, string> = {
  accumulation: 'var(--phase-accum)',
  hypertrophy: 'var(--phase-hyper)',
  intensification: 'var(--phase-intens)',
  realization: 'var(--phase-real)',
  deload: 'var(--phase-deload)',
  taper: 'var(--phase-taper)',
};
