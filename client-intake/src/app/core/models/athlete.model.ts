import type { LiftSet } from '../engine/field-types';
import { CollectionItem } from '../engine/step-def';

/**
 * Profil zawodnika — wynik intake („Dane podstawowe"). Klucze = FieldDef.id
 * (docs/SPORT-QUESTION-TREE.md). Konwencja wartości:
 *  - null       → pytanie jeszcze nie padło,
 *  - '' / []    → odpowiedziano „brak / nie wiem" (pole opcjonalne),
 *  - pozostałe  → odpowiedź (kody słowników, liczby, ISO daty, LiftSet).
 */
export interface AthleteProfile {
  /* --- 01 Profil --- */
  imie: string;
  plec: string;
  /** ISO RRRR-MM-DD */
  data_urodzenia: string;
  /** Wyliczane z daty urodzenia. */
  wiek: number | null;
  wzrost_cm: number | null;
  masa_kg: number | null;
  /** '' = nie wie → pytamy o zakres wizualny. */
  bodyfat_pct: number | '' | null;
  bodyfat_zakres: string | null;
  staz: string;

  /* --- 02 Cele --- */
  cel_glowny: string;
  faza: string;
  /** % masy ciała na tydzień (masa: przyrost, redukcja: spadek). */
  tempo: number | null;
  docelowa_masa_kg: number | '' | null;
  federacja: string | null;
  kategoria_wagowa: string | null;
  sprzet: string | null;
  /** ISO; '' = brak terminu zawodów. */
  data_zawodow: string | null;
  horyzont_tyg: number | null;
  cel_total_kg: number | '' | null;
  proporcja: string | null;
  partie_priorytetowe: string[] | null;
  /** null = nie pytano, [] = brak celów dodatkowych. */
  cele_dodatkowe: SecondaryGoal[] | null;

  /* --- 03 Siła --- */
  squat: LiftSet | null;
  bench: LiftSet | null;
  deadlift: LiftSet | null;
  deadlift_styl: string;
  ohp: LiftSet | '' | null;
  podciagniecia_max: number | '' | null;
  znajomosc_rpe: string;
  slabe_punkty: string[] | null;
  /** Wyliczane: e1RM i total. */
  e1rm_squat: number | null;
  e1rm_bench: number | null;
  e1rm_deadlift: number | null;
  e1rm_total: number | null;

  /* --- 04 Czas i sprzęt --- */
  dni_w_tygodniu: number | null;
  preferowane_dni: string[] | null;
  czas_sesji_min: number | null;
  pora_treningu: string;
  miejsce: string;
  sprzet_dostepny: string[] | null;
  dni_biegowe: number | null;
  bieg_ten_sam_dzien: boolean | null;

  /* --- 05 Regeneracja --- */
  sen_godz: number | null;
  /** bpm; '' = nie wiem (strefy z wieku). */
  tetno_spoczynkowe: number | '' | null;
  tetno_max: number | '' | null;
  jakosc_snu: number | null;
  kroki_dziennie: number | null;
  praca: string;
  stres: number | null;
  kofeina: string;
  alkohol: string;

  /* --- 06 Odżywianie --- */
  /** '' = nie wie → AI dostaje szacowane TDEE. */
  kcal_obecnie: number | '' | null;
  /** Wyliczane (Mifflin–St Jeor × aktywność). */
  tdee_szacowane: number | null;
  bialko_g: number | '' | null;
  liczy_makro: boolean | null;
  posilki_dziennie: number | null;
  dieta: string;
  nietolerancje: string | null;
  suplementy: string[] | null;

  /* --- 07 Zdrowie --- */
  kontuzje: Injury[] | null;
  kontuzje_przeszle: string | null;
  ograniczenia_ruchowe: string[] | null;
  choroby_leki: string | null;
  zakazane_cwiczenia: string | null;
  zgoda_lekarska: boolean | null;

  /* --- 08 Preferencje --- */
  ulubione_cwiczenia: string | null;
  nielubiane_cwiczenia: string | null;
  styl_programu: string;
  cardio_preferencje: string[] | null;
  uwagi: string | null;
}

/** Cel dodatkowy (półmaraton, poprawa boju, skill, mobilność). */
export interface SecondaryGoal extends CollectionItem {
  id: string;
  /** Nazwa wpisana przez operatora („półmaraton", „stanie na rękach"). */
  nazwa: string;
  typ: string;
  /** Stan obecny: czas, ciężar, sekundy… (tekst). */
  aktualnie: string;
  /** Cel: „1:45:00", „220 kg", „30 s". */
  cel: string;
  /** ISO; '' = bez terminu. */
  termin: string;
  priorytet: string;
}

/** Kontuzja obecna. */
export interface Injury extends CollectionItem {
  id: string;
  /** Wpis operatora („kolano L"). */
  nazwa: string;
  obszar: string;
  strona: string;
  /** 0–10 */
  bol: number | null;
  od_kiedy: string;
  diagnoza: string;
  fizjo: boolean | null;
  ruchy_bolesne: string[] | null;
}

export function emptyAthlete(): AthleteProfile {
  return {
    imie: '',
    plec: '',
    data_urodzenia: '',
    wiek: null,
    wzrost_cm: null,
    masa_kg: null,
    bodyfat_pct: null,
    bodyfat_zakres: null,
    staz: '',
    cel_glowny: '',
    faza: '',
    tempo: null,
    docelowa_masa_kg: null,
    federacja: null,
    kategoria_wagowa: null,
    sprzet: null,
    data_zawodow: null,
    horyzont_tyg: null,
    cel_total_kg: null,
    proporcja: null,
    partie_priorytetowe: null,
    cele_dodatkowe: null,
    squat: null,
    bench: null,
    deadlift: null,
    deadlift_styl: '',
    ohp: null,
    podciagniecia_max: null,
    znajomosc_rpe: '',
    slabe_punkty: null,
    e1rm_squat: null,
    e1rm_bench: null,
    e1rm_deadlift: null,
    e1rm_total: null,
    dni_w_tygodniu: null,
    preferowane_dni: null,
    czas_sesji_min: null,
    pora_treningu: '',
    miejsce: '',
    sprzet_dostepny: null,
    dni_biegowe: null,
    bieg_ten_sam_dzien: null,
    sen_godz: null,
    tetno_spoczynkowe: null,
    tetno_max: null,
    jakosc_snu: null,
    kroki_dziennie: null,
    praca: '',
    stres: null,
    kofeina: '',
    alkohol: '',
    kcal_obecnie: null,
    tdee_szacowane: null,
    bialko_g: null,
    liczy_makro: null,
    posilki_dziennie: null,
    dieta: '',
    nietolerancje: null,
    suplementy: null,
    kontuzje: null,
    kontuzje_przeszle: null,
    ograniczenia_ruchowe: null,
    choroby_leki: null,
    zakazane_cwiczenia: null,
    zgoda_lekarska: null,
    ulubione_cwiczenia: null,
    nielubiane_cwiczenia: null,
    styl_programu: '',
    cardio_preferencje: null,
    uwagi: null,
  };
}

/** Czy wśród celów dodatkowych jest bieg (wpływa na pytania o dni biegowe). */
export function hasRunningGoal(a: AthleteProfile): boolean {
  return (a.cele_dodatkowe ?? []).some((g) => g.typ === 'bieg');
}
