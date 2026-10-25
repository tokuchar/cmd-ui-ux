import { map } from 'rxjs';
import { FieldIssue } from '../../engine/field-def';
import { StepDef } from '../../engine/step-def';
import { plural } from '../../engine/text';
import { Customer } from '../../models/customer.model';
import { ageFromIso, V } from '../../validation/validators';
import { DICTIONARIES } from '../dictionaries.config';

/**
 * DEMO (włączane parametrem ?demo=1): pokazuje typy pól oraz INTEGRACJE Z USŁUGAMI docelowej aplikacji:
 *  - prefill z rejestru (flow.prefill, patrz flow.config.ts),
 *  - `onCommit`: strzał do usługi po zatwierdzeniu pola (identyfikator → typ podmiotu, kod pocztowy → miejscowość),
 *  - `group.onComplete`: błędy biznesowe z usługi, przypięte do pola / sekcji (legitymacja, PKD).
 * Wzorzec do kopiowania przy migracji (docs/FIELD-TYPES.md).
 */

/** Przybliżone mapowanie pierwszych dwóch cyfr kodu pocztowego na województwo (podpowiedź). */
const ZIP_PREFIX_TO_VOIVODESHIP: [number, number, string][] = [
  [0, 9, 'MZ'], [10, 14, 'WN'], [15, 19, 'PD'], [20, 24, 'LU'], [25, 29, 'SK'], [30, 34, 'MA'],
  [35, 39, 'PK'], [40, 44, 'SL'], [45, 49, 'OP'], [50, 59, 'DS'], [60, 64, 'WP'], [65, 69, 'LB'],
  [70, 78, 'ZP'], [80, 84, 'PM'], [85, 89, 'KP'], [90, 99, 'LD'],
];

export function voivodeshipFromAddress(address: string): string | undefined {
  const zip = /\b(\d{2})-\d{3}\b/.exec(address)?.[1];
  if (!zip) return undefined;
  const code = ZIP_PREFIX_TO_VOIVODESHIP.find(([from, to]) => +zip >= from && +zip <= to)?.[2];
  return DICTIONARIES['wojewodztwa'].find((e) => e.value === code)?.label;
}

/** Etykiety typów podmiotu (kod z usługi → tekst dla operatora). */
export const PODMIOT_LABELS: Record<string, string> = {
  JDG: 'Jednoosobowa działalność gospodarcza',
  OSOBA_FIZYCZNA: 'Osoba fizyczna',
};

/**
 * Błędy biznesowe karty znane dopiero po stronie usługi (zwracane z `group.onComplete`).
 * `fieldId` = id pola albo id grupy (błąd przypięty do całej sekcji).
 */
export function dodatkoweIssues(c: Customer): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const age = ageFromIso(c.data_urodzenia);
  if (age !== null && age < 18) {
    issues.push({ fieldId: 'data_urodzenia', code: 'MINOR_NEEDS_ID', message: 'Klient niepełnoletni musi posiadać legitymację.' });
  }
  if (c.typPodmiotu === 'JDG') {
    issues.push({ fieldId: 'dodatkowe', code: 'PKD_REQUIRED', message: 'Podmiot JDG musi mieć wskazane główne PKD.' });
  }
  return issues;
}

export const DODATKOWE_STEP: StepDef<Customer> = {
  id: 'dodatkowe',
  group: 'dodatkowe',
  fields: [
    {
      // Identyfikator (prefill z rejestru) → onCommit pyta usługę o typ podmiotu.
      id: 'identyfikator',
      type: 'text',
      label: 'Identyfikator (NIP / dokument)',
      sheetLabel: 'Identyfikator',
      placeholder: 'np. 5213001000',
      hint: 'Podaj NIP lub numer dokumentu — typ podmiotu ustali usługa po zatwierdzeniu.',
      required: false,
      onCommit: (ctx) =>
        ctx.api.classifyEntity(String(ctx.model.identyfikator ?? '')).pipe(
          map((res) => ({
            patch: { typPodmiotu: res.entityType },
            toast: res.entityType ? `Typ podmiotu: ${PODMIOT_LABELS[res.entityType] ?? res.entityType}` : undefined,
            // Błędy z usługi (np. pusty identyfikator) przypięte do tego pola.
            issues: (res.issues ?? []).map((i) => ({ fieldId: 'identyfikator', message: i.message, code: i.code })),
          })),
        ),
    },
    {
      // Pole USTALANE PRZEZ USŁUGĘ — nigdy nie pytane, widoczne w „Dane klienta".
      id: 'typPodmiotu',
      type: 'text',
      label: 'Typ podmiotu',
      sheetLabel: 'Typ podmiotu',
      hint: '',
      required: false,
      progress: false,
      visibleWhen: () => false,
      display: (c) => PODMIOT_LABELS[c.typPodmiotu] ?? c.typPodmiotu,
    },
    {
      id: 'data_urodzenia',
      type: 'date',
      label: 'Data urodzenia',
      placeholder: 'DD.MM.RRRR',
      hint: 'Podaj datę urodzenia — <strong>DD.MM.RRRR</strong> (np. 14.03.1985). Wiek wyliczy się automatycznie.',
      // Reguła „pełnoletniości" jest biznesowa (usługa) — nie blokujemy jej walidatorem (patrz dodatkoweIssues).
      validators: [V.notFuture(), V.notBefore('1900-01-01', 'Data nie może być wcześniejsza niż 1900 r.')],
    },
    {
      // Pole WYLICZANE — nigdy nie pytane, widoczne w „Dane klienta".
      id: 'wiek',
      type: 'number',
      label: 'Wiek',
      hint: '',
      progress: false,
      compute: (c) => ageFromIso(c.data_urodzenia),
      display: (c) => (c.wiek === null ? '' : `${c.wiek} ${plural(c.wiek, 'rok', 'lata', 'lat')}`),
      editTarget: () => 'data_urodzenia',
    },
    {
      // Select ze słownika + PODPOWIEDŹ z kodu pocztowego.
      id: 'wojewodztwo',
      type: 'select',
      dictionary: 'wojewodztwa',
      preselect: false,
      label: 'Województwo',
      placeholder: 'zacznij pisać, np. maz…',
      hint: 'Wybierz województwo — podpowiadam na podstawie kodu pocztowego klienta. Pisz, aby zawęzić listę.',
      suggest: (c) => voivodeshipFromAddress(c.adres_klienta),
    },
    {
      // Kod pocztowy → onCommit pyta usługę o miejscowość (słownik adresowy na żądanie).
      id: 'kod_pocztowy',
      type: 'text',
      label: 'Kod pocztowy',
      sheetLabel: 'Kod pocztowy',
      placeholder: 'np. 32-552',
      hint: 'Podaj kod pocztowy — miejscowość podpowie usługa.',
      required: false,
      validators: [V.regex(/^\d{2}-\d{3}$/, 'Kod w formacie 00-000.')],
      onCommit: (ctx) =>
        ctx.api.resolveAddress(String(ctx.model.kod_pocztowy ?? '')).pipe(
          map((res) => ({
            patch: res.city ? { miejscowosc: res.city } : {},
            // „Kod spoza słownika" pokazujemy jako nieblokujący toast — operator wpisze ręcznie.
            toast: res.city ? `Miejscowość: ${res.city}` : res.issues?.[0]?.message,
          })),
        ),
    },
    {
      id: 'miejscowosc',
      type: 'text',
      label: 'Miejscowość',
      sheetLabel: 'Miejscowość',
      placeholder: 'np. Płaza',
      hint: 'Miejscowość — podpowiadana z kodu pocztowego, możesz nadpisać.',
      required: false,
    },
    {
      id: 'zrodlo',
      type: 'select',
      dictionary: 'zrodla',
      label: 'Źródło pozyskania',
      placeholder: 'np. Polecenie',
      hint: 'Skąd klient dowiedział się o ofercie?',
      required: false,
      suggest: (c) => (c.polecajacy.length > 0 ? 'Polecenie' : undefined),
    },
  ],
};
