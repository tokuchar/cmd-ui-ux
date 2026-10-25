import { StepDef } from '../../engine/step-def';
import { Customer } from '../../models/customer.model';
import { V } from '../../validation/validators';

/** Grupa „Adresy" — kroki 4–5 mockupu. */

export const ADRES_KLIENTA_STEP: StepDef<Customer> = {
  id: 'adres_klienta',
  group: 'adresy',
  fields: [
    {
      id: 'adres_klienta',
      type: 'address',
      label: 'Adres klienta',
      sheetLabel: 'Adres Klienta',
      hint: 'Format: <strong>ul. Nazwa Ulicy, Miejscowość, 00-000</strong> — np. ul. Długa 5, Warszawa, 00-123.',
      validators: [V.addressPL()],
    },
  ],
};

/** Krok 5 = dwa pytania: „taki sam?" i (warunkowo) adres. */
export const ADRES_WYSYLKI_STEP: StepDef<Customer> = {
  id: 'adres_wysylki',
  group: 'adresy',
  fields: [
    {
      id: 'wysylka_same',
      type: 'boolean',
      label: 'Adres wysyłki',
      placeholder: 'tak / nie',
      hint: 'Czy adres wysyłki jest taki sam jak adres klienta? Wpisz "tak" lub "nie".',
      inSheet: false,
      progress: false,
      output: (same: boolean, c) => ({
        ...c,
        wysylka_same: same,
        adres_wysylki: same ? c.adres_klienta : c.wysylka_same === false ? c.adres_wysylki : '',
      }),
    },
    {
      id: 'adres_wysylki',
      type: 'address',
      label: 'Adres wysyłki',
      sheetLabel: 'Adres Wysyłki',
      hint: 'Format: <strong>ul. Nazwa Ulicy, Miejscowość, 00-000</strong> — np. ul. Krótka 2, Warszawa, 00-456.',
      validators: [V.addressPL()],
      // Pole wyliczane: „taki sam" → kopia adresu klienta, bez pytania.
      compute: (c) => (c.wysylka_same === true ? c.adres_klienta : undefined),
      display: (c) =>
        c.wysylka_same === true ? (c.adres_klienta ? `${c.adres_klienta} (taki sam)` : '') : c.adres_wysylki,
      // Dwuklik na „taki sam" wraca do pytania tak/nie.
      editTarget: (c) => (c.wysylka_same === true ? 'wysylka_same' : 'adres_wysylki'),
    },
  ],
};
