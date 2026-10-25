import { DictEntry } from '../engine/field-def';

/**
 * Słowniki lokalne (domyślne). Używane od startu aplikacji; po odpowiedzi
 * ClientApi.getDictionaries() słowniki o tym samym kluczu są nadpisywane danymi z backendu.
 * Kolejność = prawdopodobieństwo (pierwsza pozycja podstawiana domyślnie).
 * Nowy słownik: dodaj klucz tutaj i użyj go w FieldDef.dictionary.
 */
export const DICTIONARIES: Record<string, DictEntry[]> = {
  /** „Skąd znasz" — 1:1 z REL_OPTIONS mockupu. */
  relacje: [
    { value: 'ZNAJOMY', label: 'Znajomy' },
    { value: 'RODZINA', label: 'Rodzina' },
    { value: 'WSPOLPRACOWNIK', label: 'Współpracownik' },
    { value: 'SASIAD', label: 'Sąsiad' },
    { value: 'Z_POLECENIA', label: 'Z polecenia' },
    { value: 'INNE', label: 'Inne' },
  ],

  wojewodztwa: [
    { value: 'DS', label: 'dolnośląskie' },
    { value: 'KP', label: 'kujawsko-pomorskie' },
    { value: 'LU', label: 'lubelskie' },
    { value: 'LB', label: 'lubuskie' },
    { value: 'LD', label: 'łódzkie' },
    { value: 'MA', label: 'małopolskie' },
    { value: 'MZ', label: 'mazowieckie' },
    { value: 'OP', label: 'opolskie' },
    { value: 'PK', label: 'podkarpackie' },
    { value: 'PD', label: 'podlaskie' },
    { value: 'PM', label: 'pomorskie' },
    { value: 'SL', label: 'śląskie' },
    { value: 'SK', label: 'świętokrzyskie' },
    { value: 'WN', label: 'warmińsko-mazurskie' },
    { value: 'WP', label: 'wielkopolskie' },
    { value: 'ZP', label: 'zachodniopomorskie' },
  ],

  zrodla: [
    { value: 'POLECENIE', label: 'Polecenie' },
    { value: 'WWW', label: 'Strona internetowa', aliases: ['www', 'internet'] },
    { value: 'INFOLINIA', label: 'Infolinia' },
    { value: 'PLACOWKA', label: 'Placówka' },
    { value: 'INNE', label: 'Inne' },
  ],
};
