import { of } from 'rxjs';
import { FieldIssue } from '../engine/field-def';
import { FlowDef, GroupDef, StepDef } from '../engine/step-def';
import { AthleteProfile, emptyAthlete } from '../models/athlete.model';
import { todayIso } from '../validation/validators';
import { CEL_STEP, CELE_DODATKOWE_STEP, ZAWODY_STEP } from './steps/cele.steps';
import { OSOBA_STEP, SYLWETKA_STEP } from './steps/profil.steps';
import { AKCESORIA_SILA_STEP, BOJE_STEP } from './steps/sila.steps';
import { DOSTEPNOSC_STEP, ODZYWIANIE_STEP, REGENERACJA_STEP, SPRZET_STEP } from './steps/styl-zycia.steps';
import { KONTUZJE_STEP, OGRANICZENIA_STEP, PREFERENCJE_STEP } from './steps/zdrowie.steps';

/**
 * REJESTR PRZEPŁYWU — kolejność grup i kroków (drzewo pytań: docs/SPORT-QUESTION-TREE.md).
 * Nowy krok: plik w ./steps (szablon docs/templates/step.template.ts) + wpis w STEPS.
 * Nowa grupa: wpis w GROUPS + kolor --group-N w styles/tokens.css.
 */

export const GROUPS: GroupDef<AthleteProfile>[] = [
  { id: 'profil', label: 'Profil', color: 'var(--group-1)' },
  { id: 'cele', label: 'Cele', color: 'var(--group-2)' },
  { id: 'sila', label: 'Siła', color: 'var(--group-3)' },
  { id: 'czas', label: 'Czas i sprzęt', color: 'var(--group-4)' },
  { id: 'regeneracja', label: 'Regeneracja', color: 'var(--group-5)' },
  { id: 'odzywianie', label: 'Odżywianie', color: 'var(--group-6)' },
  { id: 'zdrowie', label: 'Kontuzje', color: 'var(--group-7)' },
  { id: 'preferencje', label: 'Preferencje', color: 'var(--group-8)' },
];

export const STEPS: StepDef<AthleteProfile>[] = [
  OSOBA_STEP,
  SYLWETKA_STEP,
  CEL_STEP,
  ZAWODY_STEP,
  CELE_DODATKOWE_STEP,
  BOJE_STEP,
  AKCESORIA_SILA_STEP,
  DOSTEPNOSC_STEP,
  SPRZET_STEP,
  REGENERACJA_STEP,
  ODZYWIANIE_STEP,
  KONTUZJE_STEP,
  OGRANICZENIA_STEP,
  PREFERENCJE_STEP,
];

export function buildFlow(): FlowDef<AthleteProfile> {
  return {
    groups: GROUPS,
    steps: STEPS,
    emptyModel: emptyAthlete,
    title: (a) => a.imie || 'zawodnik',
    // Lokalne reguły spójności profilu (bez backendu) — błędy przypięte do pól jak z usługi.
    validateCard: (model) => of(profileIssues(model)),
  };
}

/** Sprzeczności, które trzeba wyjaśnić przed wysłaniem profilu do AI. */
export function profileIssues(a: AthleteProfile): FieldIssue[] {
  const out: FieldIssue[] = [];
  const target = Number(a.docelowa_masa_kg);
  if (target && a.masa_kg) {
    if (a.faza === 'redukcja' && target >= a.masa_kg) {
      out.push({ fieldId: 'docelowa_masa_kg', message: 'Redukcja, a masa docelowa nie jest niższa od obecnej.' });
    }
    if (a.faza === 'masa' && target <= a.masa_kg) {
      out.push({ fieldId: 'docelowa_masa_kg', message: 'Masa, a masa docelowa nie jest wyższa od obecnej.' });
    }
  }
  if (a.data_zawodow && weeksUntil(a.data_zawodow) < 4) {
    out.push({ fieldId: 'data_zawodow', message: 'Mniej niż 4 tygodnie do startu — za mało na makrocykl; podaj późniejszą datę albo pomiń.' });
  }
  const days = a.preferowane_dni ?? [];
  if (days.length && a.dni_w_tygodniu && days.length < a.dni_w_tygodniu) {
    out.push({ fieldId: 'preferowane_dni', message: `Wybrano ${days.length} dni, a trenować ma ${a.dni_w_tygodniu} dni w tygodniu.` });
  }
  if (a.zgoda_lekarska === false) {
    out.push({ fieldId: 'zgoda_lekarska', message: 'Bez potwierdzenia braku przeciwwskazań plan wymaga konsultacji z lekarzem / fizjoterapeutą.' });
  }
  return out;
}

export function weeksUntil(iso: string, from = todayIso()): number {
  return Math.floor((Date.parse(iso) - Date.parse(from)) / (7 * 864e5));
}
