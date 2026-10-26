import { normalize } from '../engine/text';
import { Injury } from '../models/athlete.model';
import { ExerciseBlock, LiftKey } from '../models/plan.model';

/*
 * Które boje i ćwiczenia obciążają obszar kontuzji. Aplikacja NIE liczy sama obniżki — tylko
 * pilnuje, żeby AI podjęło decyzję (injuryNote / adjustPct / maxKg / zamiana) i ostrzega, gdy jej brak.
 */

export const AREA_LIFTS: Record<string, LiftKey[]> = {
  bark: ['bench', 'ohp'],
  lokiec: ['bench', 'ohp'],
  nadgarstek: ['bench', 'ohp'],
  klatka: ['bench'],
  kolano: ['squat'],
  biodro: ['squat', 'deadlift'],
  pachwina: ['squat', 'deadlift'],
  ledzwia: ['deadlift', 'squat'],
  dwuglowe: ['deadlift'],
  piersiowy: ['squat', 'ohp'],
};

/** Fragmenty nazw ćwiczeń ryzykownych dla obszaru (bez polskich znaków). */
export const AREA_KEYWORDS: Record<string, string[]> = {
  bark: ['wycisk', 'ohp', 'overhead', 'dip', 'nad glowa', 'wznos', 'pompk', 'handstand', 'stanie na rekach', 'podciag', 'face pull'],
  lokiec: ['francusk', 'wasko', 'uginanie', 'podciag', 'dip'],
  nadgarstek: ['wycisk', 'front', 'przedni', 'handstand', 'pompk'],
  klatka: ['wycisk', 'rozpietk', 'dip', 'pompk'],
  kolano: ['przysiad', 'wykrok', 'bulgar', 'skok', 'bieg', 'squat'],
  biodro: ['przysiad', 'martwy', 'sumo', 'wykrok', 'squat'],
  pachwina: ['sumo', 'przysiad', 'wykrok', 'squat'],
  ledzwia: ['martwy', 'good morning', 'wioslow', 'przysiad', 'deadlift', 'squat'],
  dwuglowe: ['martwy', 'rumunsk', 'deadlift', 'sprint'],
  piersiowy: ['przysiad', 'ohp', 'front'],
};

/** Kontuzja, której dotyczy ćwiczenie (po boju bazowym albo nazwie); null = żadna. */
export function injuryFor(block: Pick<ExerciseBlock, 'exercise' | 'lift'>, injuries: Injury[]): Injury | null {
  const name = normalize(block.exercise);
  return (
    injuries.find(
      (k) =>
        (block.lift && (AREA_LIFTS[k.obszar] ?? []).includes(block.lift)) ||
        (AREA_KEYWORDS[k.obszar] ?? []).some((kw) => name.includes(kw)),
    ) ?? null
  );
}

/** Poważna kontuzja: ból ≥ 7 albo naderwanie / zerwanie w diagnozie. */
export function isSevere(k: Injury): boolean {
  return (k.bol ?? 0) >= 7 || /naderw|zerw|tear|rupt|pekni/.test(normalize(`${k.diagnoza} ${k.nazwa}`));
}

/** Czy AI podjęło decyzję dla ćwiczenia przy kontuzji. */
export function hasInjuryDecision(block: ExerciseBlock): boolean {
  return !!block.injuryNote || block.load.adjustPct !== undefined || block.load.maxKg !== undefined;
}
