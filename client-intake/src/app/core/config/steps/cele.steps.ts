import { of } from 'rxjs';
import { formatDate } from '../../engine/field-types';
import { StepDef } from '../../engine/step-def';
import { escapeHtml, normalize } from '../../engine/text';
import { SecondaryGoal } from '../../models/athlete.model';
import { todayIso } from '../../validation/validators';
import { NONE_WORDS, splitTokens } from '../../engine/field-types';
import { WEIGHT_CLASSES } from '../dictionaries.config';
import { A, labelOf, MULTI, range, SKIP, slug } from './helpers';

/** Grupa „Cele" — cel główny, faza sylwetkowa, start w zawodach, cele dodatkowe. */

const isPL = (m: A) => m.cel_glowny === 'powerlifting';

export const CEL_STEP: StepDef<A> = {
  id: 'cel',
  group: 'cele',
  fields: [
    { id: 'cel_glowny', type: 'select', dictionary: 'cel_glowny', label: 'Cel główny', hint: 'Powerlifting (wynik w trójboju) czy powerbuilding (siła + sylwetka)?' },
    { id: 'faza', type: 'select', dictionary: 'faza', label: 'Faza sylwetkowa', hint: 'Co robimy z masą ciała w tym cyklu?' },
    {
      id: 'tempo',
      type: 'number',
      label: 'Tempo zmiany masy (% masy / tydz.)',
      sheetLabel: 'Tempo',
      placeholder: 'np. 0.5',
      hint: (m) =>
        m.faza === 'masa'
          ? 'Tempo przyrostu w % masy ciała na tydzień — 0,25 lean, 0,5 standard, 0,75 szybko.'
          : 'Tempo redukcji w % masy ciała na tydzień — 0,5 łagodnie, 0,75 standard, 1 agresywnie.',
      suggest: (m) => (m.faza === 'masa' ? '0.5' : '0.75'),
      validators: [range(0.1, 1.5, '%')],
      visibleWhen: (m) => m.faza === 'masa' || m.faza === 'redukcja',
      display: (m) => (m.tempo ? `${m.tempo}% / tydz.` : ''),
    },
    {
      id: 'docelowa_masa_kg',
      type: 'number',
      required: false,
      label: 'Docelowa masa ciała (kg)',
      sheetLabel: 'Masa docelowa',
      placeholder: 'np. 83',
      hint: 'Masa, do której dążysz (np. limit kategorii wagowej).' + SKIP,
      validators: [range(35, 250, ' kg')],
    },
  ],
};

export const ZAWODY_STEP: StepDef<A> = {
  id: 'zawody',
  group: 'cele',
  fields: [
    { id: 'federacja', type: 'select', dictionary: 'federacja', label: 'Federacja', hint: 'W jakiej federacji startujesz (albo planujesz)?', visibleWhen: isPL },
    {
      id: 'kategoria_wagowa',
      type: 'text',
      required: false,
      label: 'Kategoria wagowa (kg)',
      sheetLabel: 'Kategoria',
      placeholder: 'np. 83',
      hint: (m) => `Kategoria wagowa. IPF: ${(WEIGHT_CLASSES[m.plec] ?? WEIGHT_CLASSES['M']).join(', ')}.` + SKIP,
      suggest: (m) => nearestClass(m),
      visibleWhen: (m) => isPL(m) && m.federacja !== 'brak',
    },
    { id: 'sprzet', type: 'select', dictionary: 'sprzet', label: 'Kategoria sprzętowa', sheetLabel: 'Sprzęt', hint: 'W jakim sprzęcie startujesz / trenujesz boje?', visibleWhen: isPL },
    {
      id: 'data_zawodow',
      type: 'date',
      required: false,
      label: 'Data zawodów / testu maksów',
      sheetLabel: 'Zawody',
      placeholder: 'DD.MM.RRRR',
      hint: 'Kiedy zawody albo test maksów? Plan ułoży taper pod ten dzień.' + SKIP,
      validators: [(v) => (v && v <= todayIso() ? 'Data musi być w przyszłości.' : null)],
      display: (m) => (m.data_zawodow ? formatDate(m.data_zawodow) : m.data_zawodow === '' ? `brak — ${m.horyzont_tyg ?? '?'} tyg.` : ''),
    },
    {
      id: 'horyzont_tyg',
      type: 'number',
      label: 'Horyzont planu (tygodnie)',
      placeholder: 'np. 12',
      hint: 'Bez terminu zawodów — na ile tygodni układamy makrocykl? (8–24)',
      suggest: () => '12',
      validators: [range(4, 52, ' tyg.')],
      visibleWhen: (m) => m.data_zawodow === '',
      inSheet: false,
    },
    {
      id: 'cel_total_kg',
      type: 'number',
      required: false,
      label: 'Docelowy total (kg)',
      sheetLabel: 'Cel total',
      placeholder: 'np. 600',
      hint: 'Jaki total chcesz zrobić na tych zawodach / teście?' + SKIP,
      validators: [range(50, 1500, ' kg')],
      visibleWhen: isPL,
    },
    {
      id: 'proporcja',
      type: 'select',
      dictionary: 'proporcja',
      label: 'Proporcja siła / hipertrofia',
      sheetLabel: 'Proporcja',
      hint: 'Ile planu ma iść w siłę, a ile w budowanie mięśni?',
      visibleWhen: (m) => m.cel_glowny === 'powerbuilding',
    },
    {
      id: 'partie_priorytetowe',
      type: 'multiselect',
      dictionary: 'partie',
      required: false,
      label: 'Partie priorytetowe',
      sheetLabel: 'Priorytety',
      placeholder: 'np. barki, plecy',
      hint: 'Które partie chcesz rozbudować najbardziej? (max 3 dla sensownej objętości)' + MULTI,
      validators: [(v: string[]) => (v.length > 3 ? 'Wybierz maksymalnie 3 partie — więcej rozmywa priorytet.' : null)],
    },
  ],
};

/** Cele dodatkowe: lista po przecinku → pytania o każdy cel (wzorzec kolekcji). */
export const CELE_DODATKOWE_STEP: StepDef<A> = {
  id: 'cele_dodatkowe',
  group: 'cele',
  fields: [],
  collection: {
    target: 'cele_dodatkowe',
    label: 'Cele dodatkowe',
    sheetLabel: 'Cele dodatkowe',
    placeholder: 'np. półmaraton, overhead squat, stanie na rękach — albo „brak"',
    hint:
      'Cele poza głównym: bieg (5k, półmaraton), konkretny bój (squat, OHP, overhead squat), skill (stanie na rękach), mobilność. ' +
      'Wpisz po przecinku albo <strong>brak</strong>.',
    codePattern: /\S/,
    codeError: 'Wpisz cele po przecinku albo „brak".',
    allowEmpty: true,
    itemNoun: 'Cel',
    selectHint:
      'Wyszarz ✕ cele, które odpuszczamy (albo <strong>-2</strong> / <strong>+2</strong>). <strong>Enter</strong> — zapytam o szczegóły każdego.',
    load: (code) => of(parseGoals(code)),
    itemLabel: (g: SecondaryGoal) => g.nazwa,
    itemDetail: (g: SecondaryGoal) => labelOf('cel_typ', g.typ),
    itemFields: [
      { id: 'typ', type: 'select', dictionary: 'cel_typ', label: 'Rodzaj celu', hint: (g) => `Jaki to rodzaj celu: <strong>${escapeHtml(g.nazwa)}</strong>?` },
      {
        id: 'aktualnie',
        type: 'text',
        required: false,
        label: 'Stan obecny',
        placeholder: 'np. 10 km w 55 min / 60 kg x 3 / 5 s przy ścianie',
        hint: (g) => `Gdzie jesteś teraz z celem <strong>${escapeHtml(g.nazwa)}</strong>?` + SKIP,
      },
      {
        id: 'cel',
        type: 'text',
        label: 'Cel',
        placeholder: 'np. 1:45:00 / 100 kg / 30 s wolnostojąco',
        hint: (g) => `Konkretny, mierzalny cel dla <strong>${escapeHtml(g.nazwa)}</strong>.`,
      },
      {
        id: 'termin',
        type: 'date',
        required: false,
        label: 'Termin',
        placeholder: 'DD.MM.RRRR',
        hint: (g) => `Do kiedy? (np. data biegu) — <strong>${escapeHtml(g.nazwa)}</strong>.` + SKIP,
      },
      { id: 'priorytet', type: 'select', dictionary: 'priorytet', label: 'Priorytet', hint: 'Jak ważny jest ten cel względem trójboju?' },
    ],
    summary: (items: SecondaryGoal[]) => items.map((g) => g.nazwa).join(', '),
  },
};

export function guessGoalType(name: string): string {
  const n = normalize(name);
  if (/(^|\s)(5k|10k|\d+ ?km)|maraton|bieg|run|triatlon|hyrox/.test(n)) return 'bieg';
  if (/squat|przysiad|bench|wycisk|martwy|deadlift|ohp|overhead|clean|snatch|rwanie|podrzut|podciag|dip/.test(n)) return 'boj';
  if (/mobil|szpagat|split|bioder|biodr|kostk|pike|most/.test(n)) return 'mobilnosc';
  return 'skill';
}

export function parseGoals(code: string): SecondaryGoal[] {
  const tokens = splitTokens(code);
  if (tokens.length === 1 && NONE_WORDS.includes(normalize(tokens[0]))) return [];
  return tokens.map((nazwa) => ({
    id: slug(nazwa),
    nazwa,
    typ: guessGoalType(nazwa),
    aktualnie: '',
    cel: '',
    termin: '',
    priorytet: '',
  }));
}

/** Najbliższa kategoria IPF ≥ docelowej (albo obecnej) masy ciała. */
function nearestClass(m: A): string | undefined {
  const kg = Number(m.docelowa_masa_kg || m.masa_kg);
  if (!kg) return undefined;
  const classes = WEIGHT_CLASSES[m.plec] ?? WEIGHT_CLASSES['M'];
  return classes.find((c) => !c.endsWith('+') && kg <= Number(c)) ?? classes[classes.length - 1];
}
