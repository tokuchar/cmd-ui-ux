# Katalog kroków

Pytania intake są opisane jako drzewo w [SPORT-QUESTION-TREE.md](SPORT-QUESTION-TREE.md).
Definicje: `src/app/core/config/steps/*.steps.ts`, kolejność: `STEPS` w `flow.config.ts`.

| Krok | Grupa | Plik | Pola |
|---|---|---|---|
| `osoba` | Profil | `profil.steps.ts` | imie, plec, data_urodzenia, (wiek — compute) |
| `sylwetka` | Profil | `profil.steps.ts` | wzrost_cm, masa_kg, bodyfat_pct → bodyfat_zakres, staz |
| `cel` | Cele | `cele.steps.ts` | cel_glowny, faza, tempo, docelowa_masa_kg |
| `zawody` | Cele | `cele.steps.ts` | federacja, kategoria_wagowa, sprzet, data_zawodow → horyzont_tyg, cel_total_kg / proporcja, partie_priorytetowe |
| `cele_dodatkowe` | Cele | `cele.steps.ts` | kolekcja: typ, aktualnie, cel, termin, priorytet |
| `boje` | Siła | `sila.steps.ts` | squat, bench, deadlift (lift), deadlift_styl, e1RM + total (compute) |
| `sila_dodatkowe` | Siła | `sila.steps.ts` | ohp, podciagniecia_max, znajomosc_rpe, slabe_punkty |
| `dostepnosc` | Czas i sprzęt | `styl-zycia.steps.ts` | dni_w_tygodniu, preferowane_dni, czas_sesji_min, pora_treningu |
| `sprzet` | Czas i sprzęt | `styl-zycia.steps.ts` | miejsce, sprzet_dostepny, dni_biegowe, bieg_ten_sam_dzien |
| `regeneracja` | Regeneracja | `styl-zycia.steps.ts` | sen_godz, jakosc_snu, kroki_dziennie, praca, stres, kofeina, alkohol |
| `odzywianie` | Odżywianie | `styl-zycia.steps.ts` | (tdee_szacowane — compute), kcal_obecnie, bialko_g, liczy_makro, posilki_dziennie, dieta, nietolerancje, suplementy |
| `kontuzje` | Kontuzje | `zdrowie.steps.ts` | kolekcja: obszar, strona, bol, od_kiedy, diagnoza, fizjo, ruchy_bolesne |
| `ograniczenia` | Kontuzje | `zdrowie.steps.ts` | kontuzje_przeszle, ograniczenia_ruchowe, choroby_leki, zakazane_cwiczenia, zgoda_lekarska |
| `preferencje` | Preferencje | `zdrowie.steps.ts` | styl_programu, cardio_preferencje, ulubione_cwiczenia, nielubiane_cwiczenia, uwagi |

Reguły spójności na końcu intake (`profileIssues` w `flow.config.ts`): masa docelowa vs faza,
start za < 4 tyg., za mało preferowanych dni, brak potwierdzenia braku przeciwwskazań.
