// SZABLON KROKU — skopiuj do src/app/core/config/steps/<grupa>.steps.ts,
// zamień <…>, dodaj krok do STEPS w flow.config.ts i wiersze do docs/STEPS.md.
import { StepDef } from '../../engine/step-def';
import { AthleteProfile } from '../../models/athlete.model';
import { V } from '../../validation/validators';

export const <NAZWA>_STEP: StepDef<AthleteProfile> = {
  id: '<id-kroku>',
  group: '<id-grupy z GROUPS>',
  fields: [
    {
      id: '<pole w AthleteProfile>',
      type: 'text', // text | number | date | select | multiselect | scale | lift | boolean | …
      label: '<Nagłówek nad command line>',
      sheetLabel: '<Etykieta w „Dane klienta">',
      placeholder: 'np. <przykład>',
      hint: '<Instrukcja dla operatora + format>. Może zawierać <strong>HTML</strong>.',
      validators: [V.required()],
      // dictionary: '<klucz słownika>',      // select
      // allowCustom: true,                    // select z wolnym tekstem
      // preselect: false,                     // długie słowniki: bez wstępnego wyboru
      // visibleWhen: (c) => c.<pole> === <wartość>,
      // compute: (c) => <wartość lub undefined>,   // wyliczane
      // suggest: (c) => '<etykieta/tekst>',         // podpowiadane
      // input: (c) => '<tekst do command line>',
      // output: (v, c) => ({ ...c, <pole>: v }),
      // display: (c) => '<tekst w arkuszu>',
      // editTarget: (c) => '<id pola do edycji>',
    },
  ],
};
