import { ValidatorFn } from '../engine/field-def';

/**
 * Biblioteka walidatorów. Każdy walidator dostaje wartość PO sparsowaniu przez typ pola
 * i zwraca komunikat (PL) albo null. Używaj w FieldDef.validators: [V.minWords(2), …].
 * Nowy walidator: dopisz fabrykę tutaj (szablon: docs/templates/validator.template.ts).
 */
export const V = {
  required(message = 'To pole jest wymagane.'): ValidatorFn {
    return (v) => (v === null || v === undefined || String(v).trim() === '' ? message : null);
  },

  minWords(n: number, message: string): ValidatorFn {
    return (v) => (String(v ?? '').trim().split(/\s+/).filter(Boolean).length < n ? message : null);
  },

  regex(re: RegExp, message: string): ValidatorFn {
    return (v) => (re.test(String(v ?? '')) ? null : message);
  },

  maxLength(n: number, message = `Maksymalnie ${n} znaków.`): ValidatorFn {
    return (v) => (String(v ?? '').length > n ? message : null);
  },

  /** Format adresu: „ul. Nazwa Ulicy, Miejscowość, 00-000" (1:1 z mockupu). */
  addressPL(): ValidatorFn {
    return (v) => {
      const val = String(v ?? '').trim();
      if (!val) return 'Adres nie może być pusty.';
      if (!/\b\d{2}-\d{3}\b/.test(val)) return 'Brakuje kodu pocztowego w formacie 00-000.';
      const rest = val.replace(/\b\d{2}-\d{3}\b/, '').replace(/,/g, ' ').trim();
      if (rest.split(/\s+/).filter(Boolean).length < 2) {
        return 'Podaj ulicę i miejscowość, np. ul. Długa 5, Warszawa, 00-123.';
      }
      return null;
    };
  },

  /** Data (ISO) nie późniejsza niż dziś. */
  notFuture(message = 'Data nie może być z przyszłości.'): ValidatorFn {
    return (v) => (v && String(v) > todayIso() ? message : null);
  },

  /** Data (ISO) nie wcześniejsza niż podana. */
  notBefore(minIso: string, message: string): ValidatorFn {
    return (v) => (v && String(v) < minIso ? message : null);
  },

  /** Minimalny wiek liczony z daty urodzenia (ISO). */
  minAge(years: number, message = `Klient musi mieć ukończone ${years} lat.`): ValidatorFn {
    return (v) => {
      const age = ageFromIso(v);
      return age !== null && age < years ? message : null;
    };
  },

  /** PESEL: 11 cyfr + suma kontrolna. */
  pesel(message = 'Niepoprawny numer PESEL (suma kontrolna).'): ValidatorFn {
    return (v) => {
      const s = String(v ?? '');
      if (!/^\d{11}$/.test(s)) return 'PESEL musi mieć 11 cyfr.';
      const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
      const sum = w.reduce((acc, wi, i) => acc + wi * Number(s[i]), 0);
      return (10 - (sum % 10)) % 10 === Number(s[10]) ? null : message;
    };
  },
};

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pełne lata od daty ISO do dziś, null gdy brak daty. */
export function ageFromIso(iso: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const now = new Date();
  let age = now.getFullYear() - Number(m[1]);
  const beforeBirthday =
    now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
  if (beforeBirthday) age--;
  return age;
}
