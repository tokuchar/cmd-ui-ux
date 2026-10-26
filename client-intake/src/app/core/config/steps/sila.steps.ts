import { e1rm, total } from '../../domain/calc';
import { FieldDef } from '../../engine/field-def';
import { formatLift, LiftSet } from '../../engine/field-types';
import { StepDef } from '../../engine/step-def';
import { A, MULTI, range, SKIP } from './helpers';

/** Grupa „Siła" — baseline bojów (seria kg x powt. @RPE → e1RM). */

const LIFT_HINT =
  'Najcięższa seria z ostatnich 4 tygodni: <strong>ciężar x powtórzenia @RPE</strong>, np. <strong>180x3@8</strong>. ' +
  'Bez RPE = seria do upadku technicznego.';

function liftField(id: 'squat' | 'bench' | 'deadlift', label: string, placeholder: string): FieldDef<A> {
  return { id, type: 'lift', label, sheetLabel: label, placeholder, hint: `${label}. ${LIFT_HINT}`, display: (m) => liftDisplay(m[id]) };
}

function e1rmField(id: 'e1rm_squat' | 'e1rm_bench' | 'e1rm_deadlift', from: 'squat' | 'bench' | 'deadlift'): FieldDef<A> {
  return { id, type: 'number', label: `e1RM ${from}`, hint: '', compute: (m) => e1rm(m[from]), inSheet: false, progress: false };
}

function liftDisplay(l: LiftSet | null | '' | undefined): string {
  if (!l) return '';
  const max = e1rm(l);
  return `${formatLift(l)}${max ? `  →  e1RM ${max} kg` : ''}`;
}

export const BOJE_STEP: StepDef<A> = {
  id: 'boje',
  group: 'sila',
  fields: [
    liftField('squat', 'Przysiad', 'np. 180x3@8'),
    liftField('bench', 'Wyciskanie leżąc', 'np. 120x5@9'),
    liftField('deadlift', 'Martwy ciąg', 'np. 220x2@8.5'),
    { id: 'deadlift_styl', type: 'select', dictionary: 'deadlift_styl', label: 'Styl martwego ciągu', sheetLabel: 'Styl MC', hint: 'Klasyczny czy sumo?' },
    e1rmField('e1rm_squat', 'squat'),
    e1rmField('e1rm_bench', 'bench'),
    e1rmField('e1rm_deadlift', 'deadlift'),
    {
      id: 'e1rm_total',
      type: 'number',
      label: 'Total (e1RM)',
      hint: '',
      compute: (m) => total(m.e1rm_squat, m.e1rm_bench, m.e1rm_deadlift),
      display: (m) => (m.e1rm_total ? `${m.e1rm_total} kg` : ''),
      progress: false,
    },
  ],
};

export const AKCESORIA_SILA_STEP: StepDef<A> = {
  id: 'sila_dodatkowe',
  group: 'sila',
  fields: [
    {
      id: 'ohp',
      type: 'lift',
      required: false,
      label: 'Wyciskanie nad głowę (OHP)',
      sheetLabel: 'OHP',
      placeholder: 'np. 70x5@8',
      hint: 'OHP — najlepsza seria (kg x powt. @RPE).' + SKIP,
      display: (m) => liftDisplay(m.ohp),
    },
    {
      id: 'podciagniecia_max',
      type: 'number',
      required: false,
      label: 'Podciągnięcia — max powtórzeń',
      sheetLabel: 'Podciągnięcia',
      placeholder: 'np. 12',
      hint: 'Ile czystych podciągnięć nachwytem zrobisz w serii?' + SKIP,
      validators: [range(0, 60)],
    },
    {
      id: 'znajomosc_rpe',
      type: 'select',
      dictionary: 'znajomosc_rpe',
      label: 'Znajomość RPE',
      hint: 'Czy znasz skalę RPE / RIR? Od tego zależy, czy plan dawkuje ciężar przez RPE, czy przez %.',
    },
    {
      id: 'slabe_punkty',
      type: 'multiselect',
      dictionary: 'slabe_punkty',
      required: false,
      label: 'Słabe punkty',
      placeholder: 'np. wyjście z dołu, lockout',
      hint: 'Gdzie najczęściej „staje" ciężar?' + MULTI,
    },
  ],
};
