# Drzewo pytań intake (powerlifting / powerbuilding)

Legenda: `[select]` `[multi]` `[number]` `[scale a–b]` `[lift kg x powt. @RPE]` `[date]` `[bool]` `[text]`
· `?→` pytanie warunkowe (`visibleWhen`) · `(opc.)` Enter pomija · `= compute` pole wyliczane (nie pytane).
Identyfikatory = klucze `AthleteProfile` (`src/app/core/models/athlete.model.ts`).

```
intake/
├── 01_profil/                               grupa „Profil"           steps/profil.steps.ts
│   ├── imie                                  [text]
│   ├── plec                                  [select] M / K
│   ├── data_urodzenia                        [date]   min. 14 lat
│   ├── wiek                                  = compute z daty
│   ├── wzrost_cm                             [number] 120–230
│   ├── masa_kg                               [number] 35–250
│   ├── bodyfat_pct                           [number] (opc.)
│   │   └── ?→ puste  bodyfat_zakres          [select] 8–12 / 12–16 / 16–20 / 20–25 / 25+ (ocena wizualna)
│   └── staz                                  [select] <1 / 1–3 / 3–5 / 5+ lat
│
├── 02_cele/                                 grupa „Cele"             steps/cele.steps.ts
│   ├── cel_glowny                            [select] powerlifting / powerbuilding
│   ├── faza                                  [select] masa / redukcja / rekompozycja / utrzymanie
│   │   └── ?→ masa|redukcja  tempo           [number] % masy / tydz. (podpowiedź 0,5 / 0,75)
│   ├── docelowa_masa_kg                      [number] (opc.)
│   ├── ?→ powerlifting/
│   │   ├── federacja                         [select] IPF / WRPF / GPC / brak / inna
│   │   ├── ?→ federacja≠brak kategoria_wagowa [text] podpowiedź: najbliższa kategoria IPF (opc.)
│   │   ├── sprzet                            [select] classic / raw / sleeves / wraps / multiply
│   │   ├── data_zawodow                      [date] (opc.) — taper pod ten dzień
│   │   │   └── ?→ puste  horyzont_tyg        [number] 4–52 (podpowiedź 12)
│   │   └── cel_total_kg                      [number] (opc.)
│   ├── ?→ powerbuilding/
│   │   └── proporcja                         [select] 70/30 / 50/50 / 30/70
│   ├── partie_priorytetowe                   [multi] max 3 (opc.)
│   └── cele_dodatkowe/                       [kolekcja] wpis: „półmaraton, overhead squat, stanie na rękach" | „brak"
│       ├── typ                               [select] bieg / bój / skill / mobilność (zgadywany z nazwy)
│       ├── aktualnie                         [text] (opc.)  np. „10 km w 58 min"
│       ├── cel                               [text]         np. „2:05:00", „60 kg x 3", „15 s wolnostojąco"
│       ├── termin                            [date] (opc.)
│       └── priorytet                         [select] średni / wysoki / niski
│
├── 03_sila/                                 grupa „Siła"             steps/sila.steps.ts
│   ├── squat                                 [lift] 180x3@8          → e1rm_squat = compute
│   ├── bench                                 [lift]                  → e1rm_bench = compute
│   ├── deadlift                              [lift]                  → e1rm_deadlift = compute
│   ├── deadlift_styl                         [select] klasyczny / sumo
│   ├── e1rm_total                            = compute (suma e1RM)
│   ├── ohp                                   [lift] (opc.)
│   ├── podciagniecia_max                     [number] (opc.)
│   ├── znajomosc_rpe                         [select] tak / trochę / nie   → dawkowanie RPE vs %
│   └── slabe_punkty                          [multi] (opc.) dół przysiadu / klatka w benchu / lockout / zerwanie…
│
├── 04_czas/                                 grupa „Czas i sprzęt"    steps/styl-zycia.steps.ts
│   ├── dni_w_tygodniu                        [select→number] 2–6
│   ├── preferowane_dni                       [multi] pn…nd (opc.) — reguła: ≥ dni_w_tygodniu
│   ├── czas_sesji_min                        [select→number] 45 / 60 / 75 / 90 / 120
│   ├── pora_treningu                         [select] rano / południe / wieczór / zmienna
│   ├── miejsce                               [select] komercyjna / klub PL / dom
│   ├── sprzet_dostepny                       [multi] (opc.) rack, ławka, kalibrowane, SSB, maszyny, wyciągi, bieżnia, rower…
│   └── ?→ cel dodatkowy typu bieg/
│       ├── dni_biegowe                       [number] 1–7
│       └── bieg_ten_sam_dzien                [bool]
│
├── 05_regeneracja/                          grupa „Regeneracja"
│   ├── sen_godz                              [number] 3–12
│   ├── jakosc_snu                            [scale 1–10]
│   ├── kroki_dziennie                        [number]
│   ├── tetno_spoczynkowe                     [number] (opc.) → strefy Karvonena
│   ├── tetno_max                             [number] (opc.) — bez pomiaru 208 − 0,7 × wiek (Tanaka)
│   ├── praca                                 [select] siedząca / mieszana / fizyczna
│   ├── stres                                 [scale 1–10]
│   ├── kofeina                               [select]
│   └── alkohol                               [select]
│
├── 06_odzywianie/                           grupa „Odżywianie"
│   ├── tdee_szacowane                        = compute (Mifflin–St Jeor × kroki, praca, dni treningowe)
│   ├── kcal_obecnie                          [number] (opc. — „nie wiem" → AI bierze TDEE)
│   ├── bialko_g                              [number] (opc.) podpowiedź 1,8–2,2 g/kg
│   ├── liczy_makro                           [bool]
│   ├── posilki_dziennie                      [select→number]
│   ├── dieta                                 [select] standard / wege / wegan / keto / inna
│   ├── nietolerancje                         [text] (opc.)
│   └── suplementy                            [multi + własne] (opc.)
│
├── 07_zdrowie/                              grupa „Kontuzje"         steps/zdrowie.steps.ts
│   ├── kontuzje/                             [kolekcja] wpis: „kolano L, bark" | „brak"
│   │   ├── obszar                            [select + własne] (zgadywany z wpisu)
│   │   ├── strona                            [select] obie / L / P (zgadywana z „L"/„P")
│   │   ├── bol                               [scale 0–10]  → mapa ciała, ≥7 = ostrzeżenie
│   │   ├── od_kiedy                          [select] <2 tyg / 2–6 tyg / 6+ (przewlekłe)
│   │   ├── diagnoza                          [text] (opc.)
│   │   ├── fizjo                             [bool]
│   │   └── ruchy_bolesne                     [multi] (opc.) przysiad / wyciskanie / martwy / nad głową / bieg / skoki…
│   ├── kontuzje_przeszle                     [text] (opc.)
│   ├── ograniczenia_ruchowe                  [multi] (opc.) kostka / biodra / barki / piersiowy / dwugłowe → rozgrzewka
│   ├── choroby_leki                          [text] (opc.)
│   ├── zakazane_cwiczenia                    [text] (opc.)
│   └── zgoda_lekarska                        [bool] — „nie" = uwaga przy sprawdzeniu profilu
│
└── 08_preferencje/                          grupa „Preferencje"
    ├── styl_programu                         [select] mieszany / RPE / %1RM
    ├── cardio_preferencje                    [multi] (opc.)
    ├── ulubione_cwiczenia                    [text] (opc.)
    ├── nielubiane_cwiczenia                  [text] (opc.)
    └── uwagi                                 [text] (opc.) urlopy, wyjazdy, zmiany w pracy
```

## Pomysły na kolejne pytania

```
backlog/
├── historia_startow        [kolekcja] zawody: data, total, kategoria — trend siły
├── tempo_regeneracji       [scale] jak szybko wraca świeżość po ciężkim treningu
├── cykl_menstruacyjny      [bool + date] ?→ K — planowanie intensywności i kcal
├── typ_budowy              [select] długie kończyny / krótkie — dobór wariantów bojów
├── preferencja_split       [select] FBW / góra-dół / boje dniami
├── dostepnosc_sezonowa     [text] urlopy, wyjazdy (dziś w „uwagi")
├── tetno_spoczynkowe / HRV [number] — strefy cardio i readiness
└── zdjecie_sylwetki        [plik] — ocena bodyfatu przez AI
```
