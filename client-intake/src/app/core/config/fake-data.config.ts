import { AthleteProfile } from '../models/athlete.model';
import { parseGoals } from './steps/cele.steps';
import { parseInjuries } from './steps/zdrowie.steps';

/** Dane DEV dla komend `fake …` — kompletne, spójne profile przykładowych zawodników. */

export interface FakePreset<M> {
  /** Co wypełniono — do komunikatu „🧪 [DEV] Wypełniono: …". */
  label: string;
  fill: (model: M) => M;
}

/** Data ISO za `weeks` tygodni od dziś. */
function inWeeks(weeks: number): string {
  const d = new Date(Date.now() + weeks * 7 * 864e5);
  return d.toISOString().slice(0, 10);
}

const LIFESTYLE: Partial<AthleteProfile> = {
  pora_treningu: 'wieczor',
  miejsce: 'komercyjna',
  sprzet_dostepny: ['rack', 'lawka', 'pas', 'mikrotalerze', 'maszyny', 'wyciagi', 'hantle', 'rower'],
  sen_godz: 6.5,
  tetno_spoczynkowe: 58,
  tetno_max: '',
  jakosc_snu: 6,
  kroki_dziennie: 7000,
  praca: 'siedzaca',
  stres: 6,
  kofeina: '1-2',
  alkohol: 'okazjonalnie',
  bialko_g: 150,
  liczy_makro: true,
  posilki_dziennie: 4,
  dieta: 'standard',
  nietolerancje: '',
  suplementy: ['kreatyna', 'bialko', 'witd'],
  kontuzje_przeszle: '',
  choroby_leki: '',
  zakazane_cwiczenia: '',
  zgoda_lekarska: true,
  styl_programu: 'mieszany',
  nielubiane_cwiczenia: '',
  uwagi: '',
};

export const FAKE_PRESETS: Record<string, FakePreset<AthleteProfile>> = {
  pl: {
    label: 'trójboista Kuba (zawody za 14 tyg., kolano L)',
    fill: (a) => ({
      ...a,
      ...LIFESTYLE,
      imie: 'Kuba',
      plec: 'M',
      data_urodzenia: '1995-04-12',
      wzrost_cm: 180,
      masa_kg: 86,
      bodyfat_pct: 17,
      staz: '3-5',
      cel_glowny: 'powerlifting',
      faza: 'redukcja',
      tempo: 0.5,
      docelowa_masa_kg: 83,
      federacja: 'IPF',
      kategoria_wagowa: '83',
      sprzet: 'classic',
      data_zawodow: inWeeks(14),
      horyzont_tyg: null,
      cel_total_kg: 600,
      proporcja: null,
      partie_priorytetowe: ['plecy_grubosc', 'triceps'],
      cele_dodatkowe: parseGoals('overhead squat').map((g) => ({ ...g, aktualnie: '40 kg x 3', cel: '60 kg x 3', priorytet: 'niski' })),
      squat: { kg: 180, reps: 3, rpe: 8 },
      bench: { kg: 125, reps: 3, rpe: 8.5 },
      deadlift: { kg: 220, reps: 2, rpe: 8 },
      deadlift_styl: 'klasyczny',
      ohp: { kg: 75, reps: 5, rpe: 8 },
      podciagniecia_max: 12,
      znajomosc_rpe: 'tak',
      slabe_punkty: ['sq_dol', 'bp_klatka'],
      dni_w_tygodniu: 4,
      preferowane_dni: ['pn', 'wt', 'cz', 'so'],
      czas_sesji_min: 90,
      kcal_obecnie: 2700,
      kontuzje: parseInjuries('kolano L').map((k) => ({
        ...k,
        strona: 'L',
        bol: 3,
        od_kiedy: '6+',
        diagnoza: 'tendinopatia rzepki',
        fizjo: false,
        ruchy_bolesne: ['przysiad', 'skoki'],
      })),
      ograniczenia_ruchowe: ['kostka', 'piersiowy'],
      cardio_preferencje: ['spacer', 'rower'],
      ulubione_cwiczenia: 'przysiad z pauzą, wiosłowanie sztangą',
    }),
  },
  pb: {
    label: 'powerbuilderka Ola (półmaraton + stanie na rękach)',
    fill: (a) => ({
      ...a,
      ...LIFESTYLE,
      imie: 'Ola',
      plec: 'K',
      data_urodzenia: '1998-09-03',
      wzrost_cm: 168,
      masa_kg: 63,
      bodyfat_pct: '',
      bodyfat_zakres: '20-25',
      staz: '1-3',
      cel_glowny: 'powerbuilding',
      faza: 'rekompozycja',
      tempo: null,
      docelowa_masa_kg: '',
      federacja: null,
      kategoria_wagowa: null,
      sprzet: null,
      data_zawodow: '',
      horyzont_tyg: 16,
      cel_total_kg: null,
      proporcja: '50/50',
      partie_priorytetowe: ['posladki', 'barki', 'plecy'],
      cele_dodatkowe: [
        { ...parseGoals('półmaraton')[0], aktualnie: '10 km w 58 min', cel: '2:05:00', termin: inWeeks(15), priorytet: 'wysoki' },
        { ...parseGoals('stanie na rękach')[0], aktualnie: '20 s przy ścianie', cel: '15 s wolnostojąco', priorytet: 'sredni' },
      ],
      squat: { kg: 85, reps: 5, rpe: 8 },
      bench: { kg: 50, reps: 5, rpe: 8 },
      deadlift: { kg: 110, reps: 3, rpe: 8 },
      deadlift_styl: 'sumo',
      ohp: '',
      podciagniecia_max: 3,
      znajomosc_rpe: 'troche',
      slabe_punkty: [],
      dni_w_tygodniu: 4,
      preferowane_dni: ['pn', 'sr', 'pt', 'so'],
      czas_sesji_min: 75,
      dni_biegowe: 3,
      bieg_ten_sam_dzien: true,
      kcal_obecnie: '',
      kroki_dziennie: 9000,
      kontuzje: [],
      ograniczenia_ruchowe: ['barki'],
      cardio_preferencje: ['bieg', 'spacer'],
      ulubione_cwiczenia: 'hip thrust, martwy sumo',
    }),
  },
};

export const FAKE_ALIASES: Record<string, string> = { powerlifting: 'pl', powerbuilding: 'pb' };

/** `fake all` — kolejność wypełniania. */
export const FAKE_ALL = ['pl'];
