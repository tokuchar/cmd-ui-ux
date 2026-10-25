import { StepDef } from '../../engine/step-def';
import { capitalize } from '../../engine/text';
import { Customer } from '../../models/customer.model';
import { V } from '../../validation/validators';

/** Grupa „Dane podstawowe" — kroki 1–3 mockupu. */

const NAME_ERROR = 'Podaj zarówno imię, jak i nazwisko (dwa słowa).';
const capitalizeName = (part: string) => part.split('-').map(capitalize).join('-');

export const IMIE_STEP: StepDef<Customer> = {
  id: 'imie',
  group: 'podstawowe',
  fields: [
    {
      id: 'imie',
      type: 'text',
      label: 'Imię i nazwisko',
      sheetLabel: 'Imię i Nazwisko',
      placeholder: 'np. Jan Kowalski',
      hint: 'Podaj imię i nazwisko klienta.',
      requiredMessage: NAME_ERROR,
      validators: [V.minWords(2, NAME_ERROR)],
      // Jedno pytanie, dwa pola w modelu: jawne wejście i wyjście.
      input: (c) => `${c.imie} ${c.nazwisko}`.trim(),
      output: (v: string, c) => {
        const parts = v.trim().split(/\s+/);
        return { ...c, imie: capitalizeName(parts[0]), nazwisko: parts.slice(1).map(capitalizeName).join(' ') };
      },
    },
  ],
};

export const TELEFON_STEP: StepDef<Customer> = {
  id: 'telefon',
  group: 'podstawowe',
  fields: [
    {
      id: 'telefon',
      type: 'phone',
      label: 'Numer telefonu',
      sheetLabel: 'Telefon',
      placeholder: 'np. 601234567',
      hint: 'Podaj numer telefonu — dokładnie 9 cyfr.',
    },
  ],
};

export const EMAIL_STEP: StepDef<Customer> = {
  id: 'email',
  group: 'podstawowe',
  fields: [
    {
      id: 'email',
      type: 'email',
      label: 'Adres e-mail',
      sheetLabel: 'Adres E-mail',
      placeholder: 'np. jan@domena.pl',
      hint: 'Podaj adres e-mail klienta.',
    },
  ],
};
