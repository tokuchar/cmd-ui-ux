# Widok planu: graf „git tree" + komendy

Pliki: `src/app/features/plan/*` (UI), `src/app/core/plan/*` (logika: `plan-engine.ts`, `plan-commands.ts`,
`graph-layout.ts`, `plan.store.ts`, `demo-plan.ts`).

## Plan Graph

```
tydz.        W1   W2   W3   W4   W5   W6   W7   W8   W9  W10  W11  W12  W13  W14
makrocykl  ──●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◆ START
              ╲                   ╱╲                       ╱╲            ╱╲         ╱
akum./taper    ●────●────●────●──◐  │                      │ │           │ ◉───────◉
intens.                             ●────●────●────●──────◐ │           │
realizacja                                                  ●───────────●
overhead sq  · · · ○ · · · · · · · · · ○ · · · · · · · · · · · · · · · ○      (cel dodatkowy)
             ▲ dziś (bieżący tydzień od meta.startDate)
```

- tor 0 = makrocykl (`main`), mezocykle = gałęzie (fork → commity tygodni → merge), maks. 3 tory, potem tory się powtarzają,
- pod numerem tygodnia data poniedziałku; tory opisane fazą (akumulacja / intensyfikacja / realizacja / taper; hipertrofia to odmiana akumulacji), nazwa bloku pod jego pierwszym tygodniem,
- kolor = `focus` (tokeny `--phase-*`), ◐ deload, ◉ taper, ◆ tag startu, kropki nad węzłem = dni high-carb,
- grubość krawędzi = objętość, jasność węzła = intensywność, pierścień = postęp sesji tygodnia, ✓ = wszystkie wykonane,
- panel tygodnia: kafelki KPI (objętość, intensywność, kcal, białko, sen, czas), w karcie dnia top set (pierwszy blok główny) i cardio z ikoną typu,
- klik / ←→ = tydzień, Enter = szczegóły, Esc = zdejmij podświetlenie mezocyklu; na telefonie graf przewija się poziomo.

## Komendy (⌘K w zakładce Plan)

```
plan/
├── nawigacja
│   ├── nastepny | next | (Enter na pustym)   kolejny niewykonany trening → szuflada sesji + ciężary
│   ├── dzis | today                          sesja na dziś albo dzień wolny (cardio, kroki, sen, kcal)
│   ├── tydzien [n] | idz W8                  mikrocykl (7 dni jako „commity")
│   ├── makro                                 mezocykle, deloady, kcal, sen, strategia węgli
│   ├── mezo [nazwa]                          podświetl gałąź w grafie
│   └── pomoc
├── zdarzenia
│   ├── zglos choroba 2 przeziębienie        zdarzenie (typ, nasilenie 1–3, opis)
│   ├── kontuzja kolano 6                     zdarzenie + sesje do przejrzenia
│   ├── makro 2600 180 300 70 · waga 85.2     logi dzienne (makro bez liczb = makrocykl)
│   ├── sen 6.5 7 · cardio 40 z2 142          logi (bez liczb = cel snu / cardio tygodnia w bpm)
│   └── stan                                  wynik zdarzeń, sugestia przegenerowania, statystyki
├── info
│   ├── kofeina                               dawka przed treningiem, limit, godzina graniczna, kiedy pominąć
│   ├── porady [zdrowie|faza|…]               porady żywieniowe z planu (filtr kategorii, tylko bieżący tydzień)
│   ├── dieta                                 kcal/makro dnia treningowego i wolnego, high-carb, wykres kcal
│   ├── sen | regeneracja                     cel snu vs obecny (+ minuty), kroki
│   ├── cardio · prehab | rozgrzewka · deload · cele
├── trening
│   ├── sugeruj ciezary [bój]                 serie sesji (kg · powt. · tempo · RIR) albo tabela RTS (1/3/5/8 powt. × RIR 3–0); poważna kontuzja = bez tabeli
│   ├── zaloguj squat 180x3@8                 log → nowe e1RM (używane przez „sugeruj")
│   └── zrobione | pomin                      status sesji (kolor węzła)
├── modyfikacja (lokalne zmiany nad planem z AI)
│   ├── modyfikuj                             tryb ✎: „2 4x5 rir2 20X1", „2 @8", „2 %75", „2 120kg", „2 usun", „+ wiosłowanie 3x10 rir2 30X1", „gotowe"
│   ├── zamien przysiad na przysiad z pauzą
│   ├── przesun pt so
│   ├── krocej 45                             tnie akcesoria wg priority (3, potem 2)
│   └── kontuzja kolano 6                     zgłoszenie + lista sesji do przejrzenia → „prompt korekta"
└── ai
    ├── prompt · prompt korekta               do schowka
    ├── importuj                              wklej JSON (pełny plan albo patch tygodni), walidacja na żywo
    ├── eksport · historia · cofnij           plik JSON, wersje planu („commity"), powrót
    └── demo                                  plan demonstracyjny z profilu (bez AI)
```

## Zdarzenia i przegenerowanie planu

Zgłoszenia w trakcie planu: `zglos <typ> [1–3] [opis]` (kontuzja, choroba, aktywnosc, stres, sen, waga, inne), `kontuzja kolano 6`,
oraz zdarzenia automatyczne z logów: `sen 5 4` (deficyt ≥ 1 h od celu tygodnia), `waga 85.2` (trend z regresji odbiega od planu o ≥ 0,5% masy/tydz.).

```
wynik = Σ waga typu × nasilenie (1–3) × 0,5^(dni / 7) × (1,5 gdy ten sam typ ≥ 3 dni z rzędu)
         liczone od ostatniego przegenerowania
≥ 6  → obserwuj        ≥ 10 → sugerowane przegenerowanie (prompt korekta → AI → importuj)
przegenerowanie < 14 dni od poprzedniego albo ≥ 2 w 28 dniach → ostrzeżenie o zbyt częstych zmianach
```

Wagi (kontuzja 5, choroba 4, waga 2, aktywność 2, stres 1,5, sen 1, inne 1) i progi: `src/app/core/config/events.config.ts`.
`stan` pokazuje wynik, listę zdarzeń z punktami, historię przegenerowań i statystyki. Na grafie: ▲ zdarzenia tygodnia,
pionowa linia ↻ = przegenerowanie (ciągła — cały plan, przerywana — korekta od tygodnia N).

**Logi dzienne → statystyki dla AI** (`core/plan/stats.ts`, okno 14 dni): `makro 2600 180 300 70`, `waga 85.2`, `sen 6.5 7`,
`cardio 40 z2 142`. Do promptu korekty trafiają: średnie makro i % celu kcal, średnia i trend masy vs plan, sen vs cel,
minuty cardio w strefach, wykonanie sesji, trend e1RM, strefy tętna i zdarzenia z punktami.

## Do zrobienia (propozycje)

- readiness check-in przed sesją (sen, stres, ból) → auto-korekta RPE ±1,
- historia e1RM jako sparkline w Profilu (z `zaloguj`),
- diff planów po imporcie korekty (dodane / usunięte serie) przed zatwierdzeniem,
- udostępnianie planu podopiecznemu (link / PDF) — dziś eksport pliku JSON.
