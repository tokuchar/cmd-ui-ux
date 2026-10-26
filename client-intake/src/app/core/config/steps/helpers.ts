import { DictEntry, FieldDef, ValidatorFn } from '../../engine/field-def';
import { normalize } from '../../engine/text';
import { AthleteProfile } from '../../models/athlete.model';
import { DICTIONARIES } from '../dictionaries.config';

/** Wspólne fragmenty definicji pól sportowego intake. */

export type A = AthleteProfile;

/** Dopisek do podpowiedzi pola opcjonalnego. */
export const SKIP = ' <span class="text-app-muted">· Enter na pustym polu = pomiń</span>';
/** Dopisek do podpowiedzi multiselect. */
export const MULTI = ' <span class="text-app-muted">· kilka po przecinku, Tab dodaje pozycję, „brak" = nic</span>';

/**
 * Select, którego wartość w modelu jest liczbą (dni w tygodniu, minuty sesji).
 * Słownik trzyma kody tekstowe — jawne wejście/wyjście tłumaczy je na number.
 */
export function numberSelect(id: keyof A & string, dictionary: string): Pick<FieldDef<A>, 'type' | 'options' | 'input' | 'output' | 'id'> {
  const options = DICTIONARIES[dictionary];
  return {
    id,
    type: 'select',
    options,
    input: (m) => (m[id] === null || m[id] === undefined ? '' : (options.find((o) => o.value === String(m[id]))?.label ?? String(m[id]))),
    output: (v: string, m) => ({ ...m, [id]: Number(v) }),
  };
}

export function range(min: number, max: number, unit = ''): ValidatorFn {
  return (v) => (v === '' || v === null || (v >= min && v <= max) ? null : `Podaj wartość od ${min} do ${max}${unit}.`);
}

export function labelOf(dictionary: string, value: unknown): string {
  return DICTIONARIES[dictionary]?.find((o) => o.value === value)?.label ?? String(value ?? '');
}

/**
 * Pozycja słownika z wpisu („kolano L" → Kolano, „naderwany nadgrzebieniowy" → Bark).
 * Alias ≥ 5 znaków pasuje też jako początek słowa (odmiana: „nadgrzebieniowego").
 */
export function guessEntry(dictionary: string, text: string): DictEntry | undefined {
  const n = normalize(text);
  const words = n.split(' ');
  return DICTIONARIES[dictionary].find(
    (o) =>
      n.includes(normalize(o.label)) ||
      n.includes(normalize(o.value)) ||
      (o.aliases ?? []).map(normalize).some((a) => words.some((w) => w === a || (a.length >= 5 && w.startsWith(a)))),
  );
}

/** Stabilne id pozycji kolekcji z wpisanej nazwy (ponowne wczytanie zachowuje odpowiedzi). */
export function slug(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}
