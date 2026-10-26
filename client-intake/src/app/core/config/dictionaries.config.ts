import { DictEntry } from '../engine/field-def';

/**
 * Słowniki lokalne (domyślne). Używane od startu aplikacji; po odpowiedzi
 * ClientApi.getDictionaries() słowniki o tym samym kluczu są nadpisywane danymi z backendu.
 * Kolejność = prawdopodobieństwo (pierwsza pozycja podstawiana domyślnie).
 * Nowy słownik: dodaj klucz tutaj i użyj go w FieldDef.dictionary.
 */
const d = (value: string, label: string, aliases?: string[]): DictEntry => ({ value, label, aliases });

export const DICTIONARIES: Record<string, DictEntry[]> = {
  plec: [d('M', 'Mężczyzna', ['m', 'facet']), d('K', 'Kobieta', ['k'])],

  staz: [d('1-3', '1–3 lata', ['1-3']), d('3-5', '3–5 lat', ['3-5']), d('5+', '5+ lat', ['5', '5+']), d('<1', 'Poniżej roku', ['<1', '0'])],

  bodyfat_zakres: [
    d('12-16', '12–16% (widoczny zarys brzucha)', ['12-16']),
    d('16-20', '16–20% (płaski brzuch, bez zarysu)', ['16-20']),
    d('20-25', '20–25% (miękko w pasie)', ['20-25']),
    d('8-12', '8–12% (wyraźny sześciopak)', ['8-12']),
    d('25+', '25%+', ['25', '25+']),
  ],

  cel_glowny: [
    d('powerlifting', 'Powerlifting', ['pl', 'trójbój', 'trojboj']),
    d('powerbuilding', 'Powerbuilding', ['pb']),
  ],

  faza: [
    d('masa', 'Masa', ['bulk', 'nadwyżka']),
    d('redukcja', 'Redukcja', ['cut', 'deficyt']),
    d('rekompozycja', 'Rekompozycja', ['recomp']),
    d('utrzymanie', 'Utrzymanie', ['maintenance']),
  ],

  tempo_masa: [d('0.25', '0,25% masy / tydz. (lean)', ['0.25']), d('0.5', '0,5% masy / tydz.', ['0.5']), d('0.75', '0,75% masy / tydz.', ['0.75'])],
  tempo_redukcja: [d('0.5', '0,5% masy / tydz.', ['0.5']), d('0.75', '0,75% masy / tydz.', ['0.75']), d('1', '1% masy / tydz. (agresywnie)', ['1'])],

  federacja: [d('IPF', 'IPF / PZKFiTS', ['ipf']), d('WRPF', 'WRPF', ['wrpf']), d('GPC', 'GPC', ['gpc']), d('brak', 'Brak — bez startów', ['brak', 'nie']), d('inna', 'Inna')],

  sprzet: [
    d('classic', 'Classic / raw (pas, opaski na nadgarstki)', ['raw', 'classic']),
    d('raw_bez', 'Raw bez sprzętu', ['bez']),
    d('sleeves', 'Raw + ochraniacze kolan (sleeves)', ['sleeves']),
    d('wraps', 'Owijki na kolana (wraps)', ['wraps']),
    d('multiply', 'Multiply / sprzęt', ['multiply']),
  ],

  proporcja: [d('70/30', '70% siła / 30% hipertrofia'), d('50/50', '50 / 50'), d('30/70', '30% siła / 70% hipertrofia')],

  partie: [
    d('klatka', 'Klatka'),
    d('plecy', 'Plecy (szerokość)'),
    d('plecy_grubosc', 'Plecy (grubość)'),
    d('barki', 'Barki'),
    d('triceps', 'Triceps'),
    d('biceps', 'Biceps'),
    d('posladki', 'Pośladki'),
    d('czworoglowe', 'Czworogłowe'),
    d('dwuglowe', 'Dwugłowe uda'),
    d('lydki', 'Łydki'),
    d('brzuch', 'Brzuch / core'),
    d('przedramiona', 'Przedramiona / chwyt'),
  ],

  cel_typ: [
    d('bieg', 'Bieg / wytrzymałość', ['5k', '10k', 'polmaraton', 'maraton']),
    d('boj', 'Konkretny bój', ['squat', 'bench', 'ohp']),
    d('skill', 'Skill (kalistenika)', ['handstand', 'muscle-up']),
    d('mobilnosc', 'Mobilność'),
  ],

  priorytet: [d('sredni', 'Średni'), d('wysoki', 'Wysoki'), d('niski', 'Niski')],

  deadlift_styl: [d('klasyczny', 'Klasyczny', ['conv', 'conventional']), d('sumo', 'Sumo')],

  znajomosc_rpe: [d('tak', 'Tak — używam RPE/RIR'), d('troche', 'Trochę — znam ideę'), d('nie', 'Nie — pierwszy raz słyszę')],

  slabe_punkty: [
    d('sq_dol', 'Przysiad: wyjście z dołu'),
    d('sq_tulow', 'Przysiad: opadanie klatki'),
    d('bp_klatka', 'Bench: zerwanie z klatki'),
    d('bp_lockout', 'Bench: lockout'),
    d('dl_ziemia', 'Martwy: zerwanie z ziemi'),
    d('dl_kolana', 'Martwy: przejście kolan'),
    d('dl_lockout', 'Martwy: lockout'),
    d('chwyt', 'Chwyt'),
    d('technika', 'Technika ogólnie'),
  ],

  dni: [
    d('pn', 'Poniedziałek', ['pn', 'pon']),
    d('wt', 'Wtorek', ['wt']),
    d('sr', 'Środa', ['sr', 'śr']),
    d('cz', 'Czwartek', ['cz', 'czw']),
    d('pt', 'Piątek', ['pt', 'pi']),
    d('so', 'Sobota', ['sb', 'so']),
    d('nd', 'Niedziela', ['nd', 'ni']),
  ],

  dni_liczba: [d('4', '4 dni'), d('3', '3 dni'), d('5', '5 dni'), d('2', '2 dni'), d('6', '6 dni')],
  czas_sesji: [d('75', '75 min'), d('60', '60 min'), d('90', '90 min'), d('45', '45 min'), d('120', '120 min')],
  pora: [d('wieczor', 'Wieczór'), d('rano', 'Rano'), d('poludnie', 'Południe'), d('zmienna', 'Zmienna')],
  miejsce: [d('komercyjna', 'Siłownia komercyjna'), d('klub_pl', 'Klub trójbojowy'), d('dom', 'Domowa siłownia')],

  sprzet_dostepny: [
    d('rack', 'Klatka / rack'),
    d('lawka', 'Ławka'),
    d('kalibrowane', 'Talerze kalibrowane'),
    d('gryf_sq', 'Gryf do przysiadu (SSB)'),
    d('pas', 'Pas'),
    d('mikrotalerze', 'Mikrotalerze 1.25 kg', ['mikro', '1.25']),
    d('maszyny', 'Maszyny'),
    d('wyciagi', 'Wyciągi'),
    d('hantle', 'Hantle'),
    d('gumy', 'Gumy / łańcuchy'),
    d('biezna', 'Bieżnia'),
    d('rower', 'Rower stacjonarny'),
    d('wiosla', 'Ergometr wioślarski'),
  ],

  praca: [d('siedzaca', 'Siedząca'), d('mieszana', 'Mieszana'), d('fizyczna', 'Fizyczna')],
  kofeina: [d('1-2', '1–2 dziennie'), d('brak', 'Brak'), d('3+', '3+ dziennie')],
  alkohol: [d('okazjonalnie', 'Okazjonalnie'), d('brak', 'Brak'), d('regularnie', 'Regularnie (co tydzień)')],
  posilki: [d('4', '4'), d('3', '3'), d('5', '5'), d('2', '2'), d('6', '6')],
  dieta: [d('standard', 'Standardowa'), d('wege', 'Wegetariańska'), d('wegan', 'Wegańska'), d('keto', 'Keto / low-carb'), d('inna', 'Inna')],

  suplementy: [
    d('kreatyna', 'Kreatyna'),
    d('bialko', 'Odżywka białkowa'),
    d('kofeina', 'Kofeina / przedtreningówka'),
    d('omega3', 'Omega-3'),
    d('witd', 'Witamina D'),
    d('magnez', 'Magnez'),
    d('elektrolity', 'Elektrolity'),
  ],

  obszar: [
    d('kolano', 'Kolano'),
    d('ledzwia', 'Odcinek lędźwiowy', ['plecy', 'ledzwia', 'krzyz']),
    d('bark', 'Bark / stożek rotatorów', ['bark', 'barku', 'nadgrzebieniow', 'rotator', 'stozek', 'supraspinatus']),
    d('lokiec', 'Łokieć'),
    d('nadgarstek', 'Nadgarstek'),
    d('biodro', 'Biodro'),
    d('kostka', 'Kostka / stopa', ['stopa']),
    d('piersiowy', 'Odcinek piersiowy'),
    d('szyja', 'Szyja'),
    d('klatka', 'Mięsień piersiowy'),
    d('dwuglowe', 'Dwugłowe uda', ['hamstring']),
    d('pachwina', 'Pachwina / przywodziciele', ['pachwina']),
  ],

  strona: [d('obie', 'Obie / centralnie', ['c', 'srodek']), d('L', 'Lewa', ['l', 'lewe', 'lewy']), d('P', 'Prawa', ['p', 'prawe', 'prawy'])],
  od_kiedy: [d('2-6', '2–6 tygodni', ['2-6']), d('<2', 'Poniżej 2 tygodni', ['<2']), d('6+', 'Ponad 6 tygodni (przewlekłe)', ['6+'])],

  ruchy: [
    d('przysiad', 'Przysiad'),
    d('wyciskanie', 'Wyciskanie leżąc'),
    d('martwy', 'Martwy ciąg'),
    d('nad_glowa', 'Ruchy nad głową'),
    d('podciaganie', 'Podciąganie'),
    d('bieg', 'Bieg'),
    d('skoki', 'Skoki'),
    d('zgiecie', 'Zgięcie tułowia'),
  ],

  ograniczenia: [
    d('kostka', 'Mobilność kostki'),
    d('biodra', 'Mobilność bioder'),
    d('barki', 'Mobilność barków'),
    d('piersiowy', 'Odcinek piersiowy (rotacja/wyprost)'),
    d('dwuglowe', 'Sztywne dwugłowe'),
  ],

  styl_programu: [d('mieszany', 'Mieszany (% + RPE)'), d('rpe', 'RPE / RIR'), d('pct', '%1RM')],

  cardio: [
    d('spacer', 'Spacer / LISS'),
    d('rower', 'Rower'),
    d('wiosla', 'Wiosła'),
    d('bieg', 'Bieg'),
    d('interwaly', 'Interwały / HIIT'),
    d('plywanie', 'Pływanie'),
  ],
};

/** Kategorie wagowe IPF (kg). Inne federacje — wpis własny. */
export const WEIGHT_CLASSES: Record<string, string[]> = {
  M: ['59', '66', '74', '83', '93', '105', '120', '120+'],
  K: ['47', '52', '57', '63', '69', '76', '84', '84+'],
};
