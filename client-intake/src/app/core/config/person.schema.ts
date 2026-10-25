import { FieldDef } from '../engine/field-def';
import { escapeHtml } from '../engine/text';
import { Person } from '../models/customer.model';

/**
 * Pytania o każdą osobę z kolekcji „Osoby polecające" (model = Person).
 * Więcej danych o osobie = kolejne FieldDef w tej tablicy + pole w Person + mapper.
 * Etykieta w command line: „{label} — {imię osoby}", licznik: „Osoba n/N · {label}".
 */
export const PERSON_FIELDS: FieldDef<Person>[] = [
  {
    id: 'znam',
    type: 'select',
    dictionary: 'relacje',
    allowCustom: true,
    label: 'Skąd znasz',
    placeholder: 'np. Znajomy, Rodzina, Sąsiad…',
    hint: (p) => `Skąd znasz osobę <strong>${escapeHtml(p.imie)}</strong>? Wpisz lub wybierz z listy poniżej.`,
    requiredMessage: 'Podaj, skąd znasz tę osobę (np. Znajomy).',
  },
  {
    id: 'telefon',
    type: 'phone',
    label: 'Telefon',
    placeholder: 'telefon (9 cyfr)',
    hint: (p) => `Podaj numer telefonu osoby <strong>${escapeHtml(p.imie)}</strong> (9 cyfr).`,
  },
];
