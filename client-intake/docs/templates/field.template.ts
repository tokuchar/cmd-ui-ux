// SZABLONY PÓL — wklej do tablicy `fields` kroku. Pełna lista opcji: docs/FIELD-TYPES.md.
import { FieldDef } from '../../src/app/core/engine/field-def';
import { AthleteProfile } from '../../src/app/core/models/athlete.model';
import { V } from '../../src/app/core/validation/validators';

export const FIELD_EXAMPLES: FieldDef<AthleteProfile>[] = [
  // Tekst z walidacją regex
  {
    id: '<pole>', type: 'text', label: 'NIP', placeholder: 'np. 5251234567',
    hint: 'Podaj NIP — 10 cyfr, bez kresek.',
    validators: [V.regex(/^\d{10}$/, 'NIP musi mieć 10 cyfr.')],
  },
  // Data
  {
    id: '<pole>', type: 'date', label: 'Data urodzenia', placeholder: 'DD.MM.RRRR',
    hint: 'Format <strong>DD.MM.RRRR</strong>.',
    validators: [V.notFuture(), V.minAge(18)],
  },
  // Lista wyboru ze słownika (backend), długa — bez preselect, z podpowiedzią
  {
    id: '<pole>', type: 'select', dictionary: '<klucz>', preselect: false,
    label: 'Województwo', placeholder: 'zacznij pisać…', hint: 'Pisz, aby zawęzić listę; ↑↓ i Enter.',
    suggest: (c) => undefined /* np. z kodu pocztowego */,
  },
  // Tak / nie
  {
    id: '<pole>', type: 'boolean', label: 'Zgoda marketingowa', placeholder: 'tak / nie',
    hint: 'Czy klient wyraża zgodę? Wpisz "tak" lub "nie".',
  },
  // Pole wyliczane (nie jest pytane)
  {
    id: '<pole>', type: 'number', label: 'Wiek', hint: '', progress: false,
    compute: (c) => null /* np. ageFromIso(c.data_urodzenia) */,
    editTarget: () => '<pole źródłowe>',
  },
  // Pole warunkowe
  {
    id: '<pole>', type: 'text', label: 'Nazwa firmy', hint: 'Pełna nazwa z KRS.',
    visibleWhen: (c) => true /* np. c.forma === 'FIRMA' */,
  },
];
