import { estimateTdee } from '../../domain/calc';
import { StepDef } from '../../engine/step-def';
import { hasRunningGoal } from '../../models/athlete.model';
import { A, MULTI, numberSelect, range, SKIP } from './helpers';

/** Grupy „Czas i sprzęt", „Regeneracja", „Odżywianie". */

export const DOSTEPNOSC_STEP: StepDef<A> = {
  id: 'dostepnosc',
  group: 'czas',
  fields: [
    {
      ...numberSelect('dni_w_tygodniu', 'dni_liczba'),
      label: 'Dni treningowe w tygodniu',
      sheetLabel: 'Dni / tydz.',
      hint: 'Ile dni w tygodniu realnie możesz trenować siłowo?',
    },
    {
      id: 'preferowane_dni',
      type: 'multiselect',
      dictionary: 'dni',
      required: false,
      label: 'Preferowane dni',
      placeholder: 'np. pn, śr, pt, sb',
      hint: (m) => `Które dni? Wybierz ${m.dni_w_tygodniu ?? ''} (skróty: pn, wt, śr, cz, pt, sb, nd).` + MULTI,
    },
    { ...numberSelect('czas_sesji_min', 'czas_sesji'), label: 'Czas jednej sesji', sheetLabel: 'Czas sesji', hint: 'Ile maksymalnie trwa jeden trening (z rozgrzewką)?' },
    { id: 'pora_treningu', type: 'select', dictionary: 'pora', label: 'Pora treningu', sheetLabel: 'Pora', hint: 'O jakiej porze zwykle trenujesz?' },
  ],
};

export const SPRZET_STEP: StepDef<A> = {
  id: 'sprzet',
  group: 'czas',
  fields: [
    { id: 'miejsce', type: 'select', dictionary: 'miejsce', label: 'Miejsce treningu', sheetLabel: 'Miejsce', hint: 'Gdzie trenujesz?' },
    {
      id: 'sprzet_dostepny',
      type: 'multiselect',
      dictionary: 'sprzet_dostepny',
      required: false,
      label: 'Dostępny sprzęt',
      sheetLabel: 'Sprzęt',
      placeholder: 'np. rack, ławka, wyciągi, rower',
      hint: 'Co masz do dyspozycji? (plan nie zaplanuje ćwiczeń bez sprzętu)' + MULTI,
    },
    {
      id: 'dni_biegowe',
      type: 'number',
      label: 'Dni biegowe w tygodniu',
      placeholder: 'np. 3',
      hint: 'Masz cel biegowy — ile dni w tygodniu możesz biegać?',
      suggest: () => '3',
      validators: [range(1, 7)],
      visibleWhen: hasRunningGoal,
    },
    {
      id: 'bieg_ten_sam_dzien',
      type: 'boolean',
      label: 'Bieg w dzień siłowy?',
      sheetLabel: 'Bieg + siła 1 dnia',
      hint: 'Czy możesz biegać w ten sam dzień co trening siłowy (np. rano bieg, wieczorem siła)?',
      visibleWhen: hasRunningGoal,
    },
  ],
};

export const REGENERACJA_STEP: StepDef<A> = {
  id: 'regeneracja',
  group: 'regeneracja',
  fields: [
    { id: 'sen_godz', type: 'number', label: 'Sen (godz. / noc)', sheetLabel: 'Sen', placeholder: 'np. 7', hint: 'Ile średnio śpisz w nocy?', validators: [range(3, 12, ' h')] },
    { id: 'jakosc_snu', type: 'scale', min: 1, max: 10, label: 'Jakość snu (1–10)', sheetLabel: 'Jakość snu', placeholder: '1–10', hint: 'Jak oceniasz jakość snu? 1 = budzę się zmęczony, 10 = idealnie.' },
    {
      id: 'kroki_dziennie',
      type: 'number',
      label: 'Kroki dziennie',
      sheetLabel: 'Kroki',
      placeholder: 'np. 8000',
      hint: 'Średnia liczba kroków dziennie (z telefonu / zegarka).',
      validators: [range(500, 40000)],
    },
    {
      id: 'tetno_spoczynkowe',
      type: 'number',
      required: false,
      label: 'Tętno spoczynkowe (bpm)',
      sheetLabel: 'HR spocz.',
      placeholder: 'np. 58 — rano, przed wstaniem',
      hint: 'Tętno spoczynkowe (zegarek / pomiar rano). Pozwala liczyć strefy cardio metodą Karvonena.' + SKIP,
      validators: [range(30, 110, ' bpm')],
    },
    {
      id: 'tetno_max',
      type: 'number',
      required: false,
      label: 'Tętno maksymalne (bpm)',
      sheetLabel: 'HR max',
      placeholder: 'np. 188 — z testu lub zegarka',
      hint: (m) =>
        'Tętno maksymalne z testu / zegarka.' +
        (m.wiek ? ` Bez pomiaru przyjmę <strong>${Math.round(208 - 0.7 * m.wiek)} bpm</strong> (208 − 0,7 × wiek).` : '') +
        SKIP,
      validators: [range(120, 230, ' bpm')],
    },
    { id: 'praca', type: 'select', dictionary: 'praca', label: 'Tryb pracy', sheetLabel: 'Praca', hint: 'Jaki charakter ma Twoja praca?' },
    { id: 'stres', type: 'scale', min: 1, max: 10, label: 'Poziom stresu (1–10)', sheetLabel: 'Stres', placeholder: '1–10', hint: 'Średni poziom stresu poza treningiem. 1 = spokój, 10 = bardzo wysoki.' },
    { id: 'kofeina', type: 'select', dictionary: 'kofeina', label: 'Kofeina', hint: 'Ile kaw / napojów z kofeiną dziennie?' },
    { id: 'alkohol', type: 'select', dictionary: 'alkohol', label: 'Alkohol', hint: 'Jak często pijesz alkohol?' },
  ],
};

export const ODZYWIANIE_STEP: StepDef<A> = {
  id: 'odzywianie',
  group: 'odzywianie',
  fields: [
    {
      id: 'tdee_szacowane',
      type: 'number',
      label: 'TDEE (szac.)',
      sheetLabel: 'TDEE szac.',
      hint: '',
      compute: (m) => estimateTdee(m),
      display: (m) => (m.tdee_szacowane ? `~${m.tdee_szacowane} kcal` : ''),
      progress: false,
    },
    {
      id: 'kcal_obecnie',
      type: 'number',
      required: false,
      label: 'Kalorie dziennie (kcal)',
      sheetLabel: 'Kalorie',
      placeholder: 'np. 2800 — albo Enter, jeśli nie liczysz',
      hint: (m) =>
        'Ile mniej więcej kalorii jesz dziennie?' +
        (m.tdee_szacowane ? ` Szacowane zapotrzebowanie: <strong>~${m.tdee_szacowane} kcal</strong>.` : '') +
        SKIP,
      validators: [range(800, 8000, ' kcal')],
    },
    {
      id: 'bialko_g',
      type: 'number',
      required: false,
      label: 'Białko (g / dzień)',
      sheetLabel: 'Białko',
      placeholder: 'np. 160',
      hint: (m) => `Ile gramów białka dziennie?${m.masa_kg ? ` Cel orientacyjny: ${Math.round(m.masa_kg * 1.8)}–${Math.round(m.masa_kg * 2.2)} g.` : ''}` + SKIP,
      validators: [range(20, 500, ' g')],
    },
    { id: 'liczy_makro', type: 'boolean', label: 'Liczysz makro?', sheetLabel: 'Liczy makro', hint: 'Czy liczysz kalorie / makroskładniki (np. w aplikacji)?' },
    { ...numberSelect('posilki_dziennie', 'posilki'), label: 'Posiłki dziennie', sheetLabel: 'Posiłki', hint: 'Ile posiłków dziennie jesz?' },
    { id: 'dieta', type: 'select', dictionary: 'dieta', label: 'Sposób żywienia', sheetLabel: 'Dieta', hint: 'Jaki model żywienia?' },
    {
      id: 'nietolerancje',
      type: 'text',
      required: false,
      label: 'Nietolerancje / wykluczenia',
      sheetLabel: 'Wykluczenia',
      placeholder: 'np. laktoza, orzechy',
      hint: 'Czego nie jesz (alergie, nietolerancje, preferencje)?' + SKIP,
    },
    {
      id: 'suplementy',
      type: 'multiselect',
      dictionary: 'suplementy',
      allowCustom: true,
      required: false,
      label: 'Suplementy',
      placeholder: 'np. kreatyna, omega-3',
      hint: 'Co suplementujesz?' + MULTI,
    },
  ],
};
