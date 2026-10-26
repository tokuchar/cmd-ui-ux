# Kontrakt JSON planu (odpowiedź AI)

Typy: `src/app/core/models/plan.model.ts` · walidator: `src/app/core/validation/plan.validator.ts` ·
przykład: [samples/plan.example.json](samples/plan.example.json) (wygenerowany komendą `demo` dla profilu `fake pl`).
Ten sam opis trafia do promptu (`PLAN_SCHEMA_TEXT` w `src/app/core/ai/prompt-builder.ts`) — zmieniaj oba miejsca razem.

```
TrainingPlan
├── meta            { version: "1", athlete, generatedAt, startDate (pon. tyg. 1), horizonWeeks, goal,
│                     competitionDate | null, notes[] }
├── nutrition       { tdee, baseline: Macros, rules[], caffeine: Caffeine, periWorkout: Fueling, tips: Tip[] }
├── macrocycles[]   { id, name, goal,
│   └── mesocycles[] { id, name, focus, notes, kcalAdjust, carbStrategy, sleepTargetH,
│       │              focus ∈ accumulation | hypertrophy | intensification | realization | deload | taper }
│       └── microcycles[] { week (globalnie 1…N), isDeload, volumeIndex 0–1, intensityIndex 0–1, label,
│           │               nutrition { trainingDay: Macros, restDay: Macros, highCarbDays: Day[] },
│           │               recovery { sleepH, steps, notes }, cardio[] { day, type, minutes, zone, notes } }
│           └── sessions[] { day, name, focus, durationMin, notes,
│               ├── warmup[]       Drill
│               ├── prehab[]       Drill  (target = obszar kontuzji)
│               ├── main[]         Exercise
│               ├── accessories[]  Exercise
│               └── cooldown[]     Drill }
└── secondaryGoals[] { goal, type: bieg | boj | skill | mobilnosc, milestones[] { week, target } }

Macros   = { kcal, protein, carbs, fat }                     (g)
Day      = pn | wt | sr | cz | pt | so | nd
Drill    = { name, sets?, reps?, durationSec?, target?, notes? }
Exercise = { exercise, lift: squat|bench|deadlift|ohp|null, sets, reps (liczba lub "8-10"),
             rir 0–5, tempo "20X1", load: Load, injuryNote?, restSec?, notes?, priority 1|2|3 }
Load     = { method: rts | pct | kg | formula, value?, expr?, adjustPct?, maxKg?, note }
Caffeine = { preWorkoutMg, minutesBefore, dailyMaxMg, cutoffHoursBeforeSleep, skipWhen?: string[], notes?: string[] }
Fueling  = { pre?, intra?, post?, caffeineMg? }            — nutrition.periWorkout (domyślne) i session.fueling (nadpisuje)
Tip      = { category: faza | zdrowie | okolotreningowo | nawodnienie | suplementacja | sen | nawyki,
             title, text, priority?: 1|2|3, weeks?: [od, do] }
microcycle.nutrition.tips?: string[]                        — porady na konkretny tydzień (deload, taper, choroba)
```

## Żywienie, kofeina, zdrowie

AI dostaje w prompcie zasady (`NUTRITION_PRINCIPLES` w `core/ai/prompt-builder.ts`): kofeina indywidualnie
(~3 mg/kg punkt wyjścia, ≤ 400 mg/dzień, stop 8–10 h przed snem, ostrożnie przy nadciśnieniu / arytmii / lęku, reset w deload),
konkretne posiłki okołotreningowe, porady wg fazy (redukcja / rekompozycja / utrzymanie / masa) i zdrowotne (błonnik, omega-3,
wit. D, alkohol, nawodnienie, wykluczenia), suplementy tylko z mocnymi dowodami, adnotacja o konsultacji przy chorobach.
Korekta może zwrócić `{ "microcycles": [...], "nutrition": {...} }` albo samo `nutrition` — pola są scalane z planem.
Widok: panel `dieta` (karta kofeiny i okołotreningowo), `kofeina`, `porady [kategoria]`, sekcja „Paliwo" w szufladzie sesji.

## Ciężar: decyduje AI, liczy aplikacja

Dla każdego ćwiczenia AI wybiera metodę (`load.method`) i uzasadnia ją w `load.note`:

| method | ciężar | kiedy |
|---|---|---|
| `rts` | e1RM × tabela RTS(reps + rir) | domyślnie dla bojów |
| `pct` | e1RM × `value` % | technika, warianty bez własnej tabeli (przysiad przedni, tempo) |
| `kg` | `value` kg (brak = bez obciążenia / guma) | maszyny, hantle, rehab |
| `formula` | `expr` — zmienne `e1rm`, `reps`, `rir`; `+ - * / ( )`, `min`, `max` (parser bez `eval`) | gdy tabela nie pasuje: powrót po kontuzji, wariant boju |

Potem: `× (1 + adjustPct/100)` → `min(maxKg)` → zaokrąglenie do talerzy (1,25 kg z mikrotalerzami w profilu, inaczej 2,5 kg).
e1RM = ostatni `zaloguj` dla boju, inaczej profil. Gdy plan nie podaje RIR (kg / %), aplikacja liczy go odwrotnie z tabeli RTS.
Seria jest zawsze pokazywana jako `4 × 5 · 112.5 kg · 20X1 · RIR 2` + metoda + notatki.

**Tabela RTS** (`RTS_TABLE` w `core/domain/calc.ts`): % 1RM po „powtórzeniach efektywnych" (reps + RIR), krok 0,5,
1 → 100%, 3 → 92,2%, 5 → 86,3%, 8 → 78,6%, 10 → 73,9%, 12 → 68%; interpolacja liniowa, powyżej 16,5 wzór Epleya.

## Kontuzje

Prompt dostaje sekcję „Kontuzje → dotknięte ćwiczenia" (boje i słowa-klucze per obszar z `core/domain/injuries.ts`) i regułę:
dla każdego dotkniętego ćwiczenia AI zamienia je, zmniejsza (`adjustPct` / `maxKg` / `formula`) albo zostawia z uzasadnieniem —
zawsze z `injuryNote`. Naderwanie / zerwanie / ból ≥ 7 → bez obciążania obszaru (rehab `kg`, do decyzji fizjo).
Aplikacja sama nie obniża ciężaru: walidator i widok ostrzegają, gdy AI nie podjęło decyzji, a `sugeruj ciezary <bój>`
przy poważnej kontuzji obszaru nie podaje tabeli.

Stary format `load: { type: rpe|pct|kg, value }` jest dalej przyjmowany (rpe → `rts` + `rir = 10 − rpe`).

## Co sprawdza walidator

| Poziom | Reguła |
|---|---|
| błąd | niepoprawny JSON (z ` ```json ` i tekstem wokół radzi sobie sam) |
| błąd | brak / zły typ pól wymaganych, `focus`, `day`, `load.method` spoza listy, RIR > 10, % spoza 10–110, błędny `expr` |
| błąd | powtórzony numer tygodnia |
| ostrzeżenie | dziura w numeracji tygodni, `horizonWeeks` ≠ ostatni tydzień, > 6 tyg. bez deloadu, brak tempa / RIR, ćwiczenie na kontuzjowany obszar bez decyzji AI, brak strategii kofeiny / porad, kofeina > 400 mg/dzień, kofeina bez adnotacji przy chorobach z profilu |

Każdy problem ma ścieżkę (`macrocycles[0].mesocycles[1].microcycles[2].sessions[0].main[0].load.value`) —
można ją wkleić AI z prośbą o poprawkę.

## Korekta (patch)

Prompt `prompt korekta` prosi AI o `{ "microcycles": [ … ] }` od bieżącego tygodnia. Import podmienia
tygodnie po numerze (`applyPatch`), poprzednia wersja trafia do historii (`historia`, `cofnij`).

## Pola używane przez widok

| Pole | Gdzie |
|---|---|
| `volumeIndex` | grubość krawędzi gałęzi w grafie |
| `intensityIndex` | jasność węzła tygodnia |
| `isDeload` / `focus` | kolor węzła, ◐ deload, ◉ taper |
| `highCarbDays` | kropki nad węzłem, panel `dieta` |
| `lift` + `load` + `rir` + `tempo` | seria `kg · powt. · tempo · RIR`, `sugeruj ciezary` |
| `injuryNote` | 🩹 przy serii; brak → ⚠ |
| `priority` | `krocej 45` wycina najpierw 3, potem 2 |
| `secondaryGoals.milestones` | równoległe tory w grafie |
