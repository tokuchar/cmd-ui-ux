import type { LiftSet } from '../engine/field-types';

/*
 * Obliczenia treningowe i żywieniowe — czyste funkcje, bez Angulara.
 * Używane przez pola wyliczane (compute), widok profilu, prompt dla AI i komendy planu.
 */

/**
 * Tabela RTS (Reactive Training Systems): % 1RM wg „powtórzeń efektywnych" = powtórzenia + RIR,
 * krok 0,5 od 1 (1@10) do 16,5. Wiersze RPE w tabeli RTS to te same wartości przesunięte o pół powtórzenia.
 */
export const RTS_TABLE = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4,
  76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.4, 56.0,
];

/** Ułamek 1RM dla serii (powtórzenia + RIR) — tabela RTS z interpolacją, poza tabelą wzór Epleya. */
export function pctForRir(reps: number, rir = 0): number {
  const effective = Math.max(1, reps + Math.max(0, rir));
  const i = (effective - 1) * 2;
  if (i >= RTS_TABLE.length - 1) {
    const last = RTS_TABLE[RTS_TABLE.length - 1] / 100;
    const lastEff = 1 + (RTS_TABLE.length - 1) / 2;
    return last * ((1 + lastEff / 30) / (1 + effective / 30));
  }
  const lo = Math.floor(i);
  return (RTS_TABLE[lo] + (RTS_TABLE[lo + 1] - RTS_TABLE[lo]) * (i - lo)) / 100;
}

/** Ułamek 1RM dla serii z RPE (RIR = 10 − RPE; brak RPE = do upadku). */
export function pctOf1RM(reps: number, rpe: number | null = 10): number {
  return pctForRir(reps, 10 - (rpe ?? 10));
}

/** RIR, przy którym `reps` powtórzeń z ciężarem `pct` (ułamek 1RM) — odwrotność tabeli; null = ponad maks. */
export function rirForPct(reps: number, pct: number): number | null {
  if (pct > pctForRir(reps, 0) + 0.005) return null;
  let rir = 0;
  while (rir < 10 && pctForRir(reps, rir + 0.5) >= pct - 1e-6) rir += 0.5;
  return rir;
}

/** Szacowane 1RM z serii (kg × powtórzenia @RPE), zaokrąglone do 0,5 kg. */
export function e1rm(set: LiftSet | null | undefined): number | null {
  if (!set || !set.kg) return null;
  return roundTo(set.kg / pctOf1RM(set.reps, set.rpe), 0.5);
}

/** Ciężar dla serii: z e1RM i RIR/RPE (tabela RTS) albo %1RM. Zaokrąglenie do talerzy (`step`). */
export function suggestLoad(
  max: number,
  target: { reps: number; rir?: number | null; rpe?: number | null; pct?: number | null },
  step = 2.5,
): number {
  const rir = target.rir ?? (target.rpe !== undefined && target.rpe !== null ? 10 - target.rpe : 2);
  const pct = target.pct ? target.pct / 100 : pctForRir(target.reps, rir);
  return roundTo(max * pct, step);
}

export function roundTo(v: number, step: number): number {
  return Math.round(Math.round(v / step) * step * 100) / 100;
}

/** BMR Mifflin–St Jeor × współczynnik aktywności z kroków, pracy i liczby treningów. */
export function estimateTdee(p: {
  plec: string;
  masa_kg: number | null;
  wzrost_cm: number | null;
  wiek: number | null;
  kroki_dziennie: number | null;
  praca: string;
  dni_w_tygodniu: number | null;
}): number | null {
  if (!p.masa_kg || !p.wzrost_cm || !p.wiek) return null;
  const bmr = 10 * p.masa_kg + 6.25 * p.wzrost_cm - 5 * p.wiek + (p.plec === 'K' ? -161 : 5);
  const steps = p.kroki_dziennie ?? 6000;
  let factor = 1.2 + Math.min(Math.max(steps - 3000, 0), 12000) / 40000; // 3k → 1.2, 15k → 1.5
  factor += p.praca === 'fizyczna' ? 0.1 : p.praca === 'mieszana' ? 0.05 : 0;
  factor += (p.dni_w_tygodniu ?? 3) * 0.025;
  return Math.round((bmr * factor) / 10) * 10;
}

/** Suma e1RM trzech bojów (total) albo null, gdy któregoś brakuje. */
export function total(...maxes: (number | null)[]): number | null {
  return maxes.every((m) => m) ? maxes.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
}

/** Wilks-podobny wskaźnik siły względnej: total / masa ciała. */
export function relativeStrength(totalKg: number | null, bodyKg: number | null): number | null {
  return totalKg && bodyKg ? Math.round((totalKg / bodyKg) * 100) / 100 : null;
}

export interface HrZone {
  zone: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
  min: number;
  max: number;
  label: string;
}

const ZONE_BANDS: [HrZone['zone'], number, number, string][] = [
  ['Z1', 0.5, 0.6, 'regeneracja'],
  ['Z2', 0.6, 0.7, 'baza tlenowa'],
  ['Z3', 0.7, 0.8, 'tempo'],
  ['Z4', 0.8, 0.9, 'próg'],
  ['Z5', 0.9, 1, 'VO2max'],
];

/**
 * Strefy tętna Z1–Z5. HRmax: podane albo Tanaka (208 − 0,7 × wiek). Z tętnem spoczynkowym —
 * metoda Karvonena (% rezerwy tętna), bez niego — % HRmax. null = za mało danych.
 */
export function hrZones(p: { wiek: number | null; tetno_max: number | '' | null; tetno_spoczynkowe: number | '' | null }): HrZone[] {
  const max = Number(p.tetno_max) || (p.wiek ? Math.round(208 - 0.7 * p.wiek) : 0);
  if (!max) return [];
  const rest = Number(p.tetno_spoczynkowe) || 0;
  const at = (f: number) => Math.round(rest ? rest + (max - rest) * f : max * f);
  return ZONE_BANDS.map(([zone, lo, hi, label]) => ({ zone, min: at(lo), max: at(hi), label }));
}
