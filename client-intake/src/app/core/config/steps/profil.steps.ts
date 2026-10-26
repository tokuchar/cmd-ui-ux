import { StepDef } from '../../engine/step-def';
import { capitalize } from '../../engine/text';
import { ageFromIso, V } from '../../validation/validators';
import { A, range, SKIP } from './helpers';

/** Grupa „Profil" — kim jest zawodnik. */

export const OSOBA_STEP: StepDef<A> = {
  id: 'osoba',
  group: 'profil',
  fields: [
    {
      id: 'imie',
      type: 'text',
      label: 'Imię',
      sheetLabel: 'Imię',
      placeholder: 'np. Kuba',
      hint: 'Jak masz na imię? (wystarczy imię lub ksywka)',
      output: (v: string, m) => ({ ...m, imie: v.split(/\s+/).map(capitalize).join(' ') }),
    },
    { id: 'plec', type: 'select', dictionary: 'plec', label: 'Płeć', hint: 'Płeć — potrzebna do kategorii wagowej i szacowania zapotrzebowania kalorycznego.' },
    {
      id: 'data_urodzenia',
      type: 'date',
      label: 'Data urodzenia',
      placeholder: 'DD.MM.RRRR',
      hint: 'Data urodzenia (DD.MM.RRRR) — wiek wpływa na regenerację i objętość.',
      validators: [V.notFuture(), V.minAge(14, 'Plan dla osób od 14 lat.')],
    },
    { id: 'wiek', type: 'number', label: 'Wiek', hint: '', compute: (m) => ageFromIso(m.data_urodzenia), progress: false },
  ],
};

export const SYLWETKA_STEP: StepDef<A> = {
  id: 'sylwetka',
  group: 'profil',
  fields: [
    { id: 'wzrost_cm', type: 'number', label: 'Wzrost (cm)', placeholder: 'np. 180', hint: 'Wzrost w centymetrach.', validators: [range(120, 230, ' cm')] },
    {
      id: 'masa_kg',
      type: 'number',
      label: 'Masa ciała (kg)',
      placeholder: 'np. 86.5',
      hint: 'Aktualna masa ciała — najlepiej średnia z kilku porannych pomiarów.',
      validators: [range(35, 250, ' kg')],
    },
    {
      id: 'bodyfat_pct',
      type: 'number',
      required: false,
      label: 'Tkanka tłuszczowa (%)',
      sheetLabel: 'Bodyfat',
      placeholder: 'np. 16 — albo Enter, jeśli nie wiesz',
      hint: 'Mniej więcej ile % tkanki tłuszczowej? Nie wiesz — zostaw puste, zapytam o wygląd.' + SKIP,
      validators: [range(3, 60, '%')],
      display: (m) => (m.bodyfat_pct ? `${m.bodyfat_pct}%` : m.bodyfat_zakres ? `~${m.bodyfat_zakres}%` : ''),
    },
    {
      id: 'bodyfat_zakres',
      type: 'select',
      dictionary: 'bodyfat_zakres',
      label: 'Bodyfat — ocena wizualna',
      hint: 'Który opis najbardziej pasuje do sylwetki?',
      visibleWhen: (m) => m.bodyfat_pct === '',
      inSheet: false,
    },
    { id: 'staz', type: 'select', dictionary: 'staz', label: 'Staż treningu siłowego', sheetLabel: 'Staż', hint: 'Jak długo trenujesz regularnie z ciężarami?' },
  ],
};
