import { of } from 'rxjs';
import { NONE_WORDS, splitTokens } from '../../engine/field-types';
import { StepDef } from '../../engine/step-def';
import { escapeHtml, normalize } from '../../engine/text';
import { Injury } from '../../models/athlete.model';
import { DICTIONARIES } from '../dictionaries.config';
import { A, guessEntry, labelOf, MULTI, SKIP, slug } from './helpers';

/** Grupy „Kontuzje i ograniczenia" oraz „Preferencje". */

const painful = (m: A) => (m.kontuzje ?? []).some((k) => (k.bol ?? 0) >= 7);

export const KONTUZJE_STEP: StepDef<A> = {
  id: 'kontuzje',
  group: 'zdrowie',
  fields: [],
  collection: {
    target: 'kontuzje',
    label: 'Kontuzje obecne',
    sheetLabel: 'Kontuzje',
    placeholder: 'np. kolano L, bark P — albo „brak"',
    hint: 'Co Cię teraz boli lub ogranicza? Wpisz po przecinku (np. <strong>kolano L, łokieć</strong>) albo <strong>brak</strong>.',
    codePattern: /\S/,
    codeError: 'Wpisz kontuzje po przecinku albo „brak".',
    allowEmpty: true,
    itemNoun: 'Kontuzja',
    selectHint: 'Wyszarz ✕ pozycje pomyłkowe. <strong>Enter</strong> — zapytam o szczegóły każdej (ból, od kiedy, bolesne ruchy).',
    load: (code) => of(parseInjuries(code)),
    itemLabel: (k: Injury) => k.nazwa,
    itemDetail: (k: Injury) => [labelOf('obszar', k.obszar), k.strona ? labelOf('strona', k.strona) : ''].filter(Boolean).join(' · '),
    itemFields: [
      { id: 'obszar', type: 'select', dictionary: 'obszar', allowCustom: true, label: 'Obszar', hint: (k) => `Jaki obszar ciała — <strong>${escapeHtml(k.nazwa)}</strong>?` },
      { id: 'strona', type: 'select', dictionary: 'strona', label: 'Strona', hint: 'Która strona?' },
      { id: 'bol', type: 'scale', min: 0, max: 10, label: 'Ból (0–10)', placeholder: '0–10', hint: (k) => `Jak mocny ból przy wysiłku — <strong>${escapeHtml(k.nazwa)}</strong>? 0 = brak, 10 = nie do zniesienia.` },
      { id: 'od_kiedy', type: 'select', dictionary: 'od_kiedy', label: 'Od kiedy', hint: 'Od kiedy trwa problem?' },
      {
        id: 'diagnoza',
        type: 'text',
        required: false,
        label: 'Diagnoza',
        placeholder: 'np. zapalenie ścięgna rzepki',
        hint: 'Czy jest diagnoza (lekarz / fizjoterapeuta)?' + SKIP,
      },
      { id: 'fizjo', type: 'boolean', label: 'Pod opieką fizjo?', hint: 'Czy jesteś pod opieką fizjoterapeuty z tym problemem?' },
      {
        id: 'ruchy_bolesne',
        type: 'multiselect',
        dictionary: 'ruchy',
        required: false,
        label: 'Bolesne ruchy',
        placeholder: 'np. przysiad, skoki',
        hint: (k) => `Które ruchy prowokują ból — <strong>${escapeHtml(k.nazwa)}</strong>?` + MULTI,
      },
    ],
    summary: (items: Injury[]) => items.map((k) => `${k.nazwa}${k.bol !== null ? ` (${k.bol}/10)` : ''}`).join(', '),
  },
};

export const OGRANICZENIA_STEP: StepDef<A> = {
  id: 'ograniczenia',
  group: 'zdrowie',
  fields: [
    {
      id: 'kontuzje_przeszle',
      type: 'text',
      required: false,
      label: 'Przebyte kontuzje / operacje',
      sheetLabel: 'Przeszłe kontuzje',
      placeholder: 'np. rekonstrukcja ACL 2019',
      hint: 'Poważniejsze kontuzje lub operacje w przeszłości.' + SKIP,
    },
    {
      id: 'ograniczenia_ruchowe',
      type: 'multiselect',
      dictionary: 'ograniczenia',
      required: false,
      label: 'Ograniczenia mobilności',
      sheetLabel: 'Mobilność',
      placeholder: 'np. mobilność kostki',
      hint: 'Co jest „sztywne"? Plan dołoży pracę w rozgrzewce.' + MULTI,
    },
    {
      id: 'choroby_leki',
      type: 'text',
      required: false,
      label: 'Choroby / leki',
      placeholder: 'np. nadciśnienie, astma',
      hint: 'Choroby przewlekłe lub leki, które wpływają na trening (np. nadciśnienie).' + SKIP,
    },
    {
      id: 'zakazane_cwiczenia',
      type: 'text',
      required: false,
      label: 'Ćwiczenia zakazane',
      placeholder: 'np. good morning, skoki',
      hint: 'Ćwiczenia, których nie wolno / nie chcesz robić.' + SKIP,
    },
    {
      id: 'zgoda_lekarska',
      type: 'boolean',
      label: 'Brak przeciwwskazań lekarskich?',
      sheetLabel: 'Brak przeciwwskazań',
      hint: (m) =>
        (painful(m) ? '<strong>Zgłoszono ból ≥ 7/10.</strong> ' : '') +
        'Potwierdzasz brak przeciwwskazań do intensywnego treningu? Plan z AI nie zastępuje porady lekarza ani fizjoterapeuty.',
    },
  ],
};

export const PREFERENCJE_STEP: StepDef<A> = {
  id: 'preferencje',
  group: 'preferencje',
  fields: [
    { id: 'styl_programu', type: 'select', dictionary: 'styl_programu', label: 'Dawkowanie ciężaru', sheetLabel: 'Styl programu', hint: 'Jak plan ma podawać ciężary?' },
    {
      id: 'cardio_preferencje',
      type: 'multiselect',
      dictionary: 'cardio',
      required: false,
      label: 'Preferowane cardio',
      sheetLabel: 'Cardio',
      placeholder: 'np. rower, spacer',
      hint: 'Jakie cardio lubisz / akceptujesz?' + MULTI,
    },
    {
      id: 'ulubione_cwiczenia',
      type: 'text',
      required: false,
      label: 'Ulubione ćwiczenia',
      sheetLabel: 'Lubi',
      placeholder: 'np. przysiad z pauzą, wiosłowanie',
      hint: 'Ćwiczenia, które lubisz i chcesz mieć w planie.' + SKIP,
    },
    {
      id: 'nielubiane_cwiczenia',
      type: 'text',
      required: false,
      label: 'Nielubiane ćwiczenia',
      sheetLabel: 'Nie lubi',
      placeholder: 'np. bułgarskie przysiady',
      hint: 'Czego unikać, jeśli się da?' + SKIP,
    },
    {
      id: 'uwagi',
      type: 'text',
      required: false,
      label: 'Uwagi dla trenera',
      sheetLabel: 'Uwagi',
      placeholder: 'np. w lipcu 2 tygodnie urlopu',
      hint: 'Cokolwiek jeszcze: urlopy, zmiany w pracy, wyjazdy.' + SKIP,
    },
  ],
};

export function parseInjuries(code: string): Injury[] {
  const tokens = splitTokens(code);
  if (tokens.length === 1 && NONE_WORDS.includes(normalize(tokens[0]))) return [];
  return tokens.map((nazwa) => {
    const words = normalize(nazwa).split(' ');
    const side = DICTIONARIES['strona'].find((s) => s.value !== 'obie' && (s.aliases ?? []).some((a) => words.includes(a)));
    return {
      id: slug(nazwa),
      nazwa,
      obszar: guessEntry('obszar', nazwa)?.value ?? '',
      strona: side?.value ?? '',
      bol: null,
      od_kiedy: '',
      diagnoza: '',
      fizjo: null,
      ruchy_bolesne: null,
    };
  });
}
