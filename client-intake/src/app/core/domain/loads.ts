import { ExerciseBlock } from '../models/plan.model';
import { pctForRir, rirForPct, roundTo } from './calc';
import { evalFormula } from './formula';

/** Wynik wykonania decyzji AI o ciężarze dla jednego ćwiczenia. */
export interface ResolvedLoad {
  kg: number | null;
  /** RIR z planu albo wyliczony z tabeli RTS (dla kg / %). */
  rir: number | null;
  /** maxKg obciął wynik. */
  capped: boolean;
  /** Np. „brak e1RM", „błąd wzoru: …", „ciężar ponad e1RM". */
  warning: string | null;
}

/** Pierwsza liczba z „8-10", „30 s" itp. (domyślnie 5). */
export function repsOf(reps: string | number): number {
  return Number(/\d+/.exec(String(reps))?.[0] ?? 5);
}

/**
 * kg dla ćwiczenia wg metody wybranej przez AI → korekta adjustPct → limit maxKg → talerze (`step`).
 * `e1rm` = null, gdy brak boju bazowego / danych — wtedy tylko metoda `kg` daje ciężar.
 */
export function resolveLoad(block: ExerciseBlock, e1rm: number | null, step: number): ResolvedLoad {
  const load = block.load;
  const reps = repsOf(block.reps);
  const rir = block.rir ?? null;
  let raw: number | null = null;
  let warning: string | null = null;

  switch (load.method) {
    case 'kg':
      raw = load.value ?? null;
      break;
    case 'pct':
      raw = e1rm && load.value ? (e1rm * load.value) / 100 : null;
      break;
    case 'rts':
      raw = e1rm ? e1rm * pctForRir(reps, rir ?? 2) : null;
      break;
    case 'formula': {
      const res = evalFormula(load.expr ?? '', { e1rm: e1rm ?? 0, reps, rir: rir ?? 2 });
      if (!res.ok) warning = `błąd wzoru: ${res.error}`;
      else if (/e1rm/i.test(load.expr ?? '') && !e1rm) warning = 'brak e1RM';
      else raw = res.value;
      break;
    }
  }
  // Bez boju bazowego ciężar dobiera się na RIR — to nie jest problem, tylko brak e1RM dla boju.
  if (raw === null && !warning && load.method !== 'kg' && block.lift) warning = 'brak e1RM';

  let capped = false;
  if (raw !== null && load.method !== 'kg' && load.adjustPct) raw *= 1 + load.adjustPct / 100;
  if (raw !== null && load.maxKg !== undefined && raw > load.maxKg) {
    raw = load.maxKg;
    capped = true;
  }
  const kg = raw !== null ? Math.max(0, roundTo(raw, step)) : null;

  // RIR: z planu; dla kg/%/wzoru z bojem bazowym — z tabeli RTS.
  let shownRir = rir;
  if (shownRir === null && kg && e1rm) {
    shownRir = rirForPct(reps, kg / e1rm);
    if (shownRir === null) warning = warning ?? 'ciężar ponad e1RM dla tylu powtórzeń';
  }
  return { kg, rir: shownRir, capped, warning };
}

const METHOD_LABELS: Record<ExerciseBlock['load']['method'], string> = { rts: 'RTS', pct: '%', kg: 'kg', formula: 'wzór' };

/** „4 × 5 · 100 kg · 20X1 · RIR 2" — jeden format serii w całej aplikacji. */
export function formatSet(block: ExerciseBlock, r: ResolvedLoad): string {
  const parts = [`${block.sets} × ${block.reps}`];
  parts.push(r.kg !== null ? `${r.kg} kg` : block.load.method === 'kg' ? 'bez obciążenia' : '— kg');
  parts.push(block.tempo ?? '—');
  parts.push(r.rir !== null ? `RIR ${r.rir}` : 'RIR —');
  return parts.join(' · ');
}

/** Krótki opis metody: „RTS", „65%", „wzór", „kg" + korekty. */
export function methodLabel(block: ExerciseBlock): string {
  const l = block.load;
  const base = l.method === 'pct' ? `${l.value}%` : METHOD_LABELS[l.method];
  return [base, l.adjustPct ? `${l.adjustPct > 0 ? '+' : ''}${l.adjustPct}%` : '', l.maxKg !== undefined ? `≤${l.maxKg} kg` : ''].filter(Boolean).join(' ');
}
