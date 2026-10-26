import { e1rm, hrZones } from '../domain/calc';
import { AREA_KEYWORDS, AREA_LIFTS, isSevere } from '../domain/injuries';
import { formatLift, TypeContext } from '../engine/field-types';
import { fieldDisplay } from '../engine/field-runtime';
import { FlowDef } from '../engine/step-def';
import { AthleteProfile } from '../models/athlete.model';
import { TrainingPlan } from '../models/plan.model';
import { todayIso } from '../validation/validators';

/*
 * Prompty kopiowane do AI (flow ręczny: „Kopiuj prompt" → czat z AI → „Wklej JSON").
 * Prompt = rola + dane zawodnika (czytelnie i jako JSON) + kontrakt JSON + reguły.
 */

/** Szkielet JSON z opisami — AI ma zwrócić dokładnie taki kształt (docs/PLAN-SCHEMA.md). */
export const PLAN_SCHEMA_TEXT = `{
  "meta": { "version": "1", "athlete": string, "generatedAt": ISO, "startDate": ISO (poniedziałek tygodnia 1),
            "horizonWeeks": number, "goal": string, "competitionDate": ISO | null, "notes": string[] },
  "nutrition": { "tdee": number, "baseline": Macros, "rules": string[],
                 "caffeine": Caffeine, "periWorkout": Fueling, "tips": Tip[] },
  "macrocycles": [{ "id": string, "name": string, "goal": string,
    "mesocycles": [{ "id": string, "name": string,
      "focus": "accumulation" | "hypertrophy" | "intensification" | "realization" | "deload" | "taper",
      "notes": string, "kcalAdjust": number, "carbStrategy": string, "sleepTargetH": number,
      "microcycles": [{ "week": number (globalnie 1..horizonWeeks), "isDeload": boolean,
        "volumeIndex": 0..1, "intensityIndex": 0..1, "label": string,
        "nutrition": { "trainingDay": Macros, "restDay": Macros, "highCarbDays": Day[], "tips"?: string[] (porady na ten tydzień) },
        "recovery": { "sleepH": number, "steps": number, "notes": string },
        "cardio": [{ "day": Day, "type": string, "minutes": number, "zone": "Z1".."Z5", "notes": string }],
        "sessions": [{ "day": Day, "name": string, "focus": string, "durationMin": number,
          "warmup": Drill[], "prehab": Drill[], "main": Exercise[], "accessories": Exercise[], "cooldown": Drill[],
          "fueling"?: Fueling (nadpisuje periWorkout dla tej sesji, np. ciężki przysiad, wieczorny trening), "notes": string }]
      }]
    }]
  }],
  "secondaryGoals": [{ "goal": string, "type": "bieg" | "boj" | "skill" | "mobilnosc",
                       "milestones": [{ "week": number, "target": string }] }]
}
Macros   = { "kcal": number, "protein": number, "carbs": number, "fat": number }   (gramy)
Caffeine = { "preWorkoutMg": number, "minutesBefore": number, "dailyMaxMg": number, "cutoffHoursBeforeSleep": number,
             "skipWhen": string[] (kiedy pominąć / zmniejszyć), "notes": string[] }
Fueling  = { "pre"?: string, "intra"?: string, "post"?: string, "caffeineMg"?: number }   (konkretnie: ile, czego, kiedy)
Tip      = { "category": "faza" | "zdrowie" | "okolotreningowo" | "nawodnienie" | "suplementacja" | "sen" | "nawyki",
             "title": string, "text": string, "priority": 1|2|3, "weeks"?: [od, do] }
Day      = "pn" | "wt" | "sr" | "cz" | "pt" | "so" | "nd"
Drill    = { "name": string, "sets"?: number, "reps"?: string|number, "durationSec"?: number, "target"?: string, "notes"?: string }
Exercise = { "exercise": string, "lift": "squat"|"bench"|"deadlift"|"ohp"|null, "sets": number, "reps": string|number,
             "rir": 0..5, "tempo": "20X1" (ekscentryk-pauza dół-koncentryk-pauza góra, X = eksplozywnie),
             "load": Load, "restSec": number, "injuryNote"?: string, "notes"?: string, "priority": 1|2|3 }
Load     = { "method": "rts" | "pct" | "kg" | "formula",
             "value"?: number          (pct: % e1RM, kg: ciężar w kg; kg bez value = bez obciążenia / guma),
             "expr"?: string           (formula: zmienne e1rm, reps, rir; + - * / ( ) min max — np. "min(e1rm * 0.5, 60)"),
             "adjustPct"?: number      (korekta wyniku w %, np. -25 przy kontuzji),
             "maxKg"?: number          (twardy limit ciężaru),
             "note": string            (dlaczego ta metoda) }
Aplikacja liczy kg sama: rts = e1RM × tabela RTS(reps + rir), pct = e1RM × value%, formula = expr → potem adjustPct, maxKg, zaokrąglenie do talerzy.`;

/**
 * Zasady programowania, na których AI ma oprzeć plan — uznani trenerzy i badacze + aktualne praktyki
 * powerbuildingu. Opisowo (bez dosłownych programów), żeby AI łączyło je z danymi zawodnika.
 */
export const COACHING_PRINCIPLES = [
  'Hierarchia priorytetów (E. Helms, „Muscle and Strength Pyramids"): wykonalność i regularność > objętość/intensywność/częstotliwość > progresja > dobór ćwiczeń > tempo i przerwy.',
  'Objętość (M. Israetel, RP): planuj serie na partię między MEV a MRV, zwiększaj w mezocyklu i schodź RIR (np. 3 → 0–1), deload, gdy objętość lub zmęczenie dochodzą do MRV.',
  'Boje (M. Tuchscherer, RTS): dawkowanie RPE/RIR z e1RM, ciężka seria dnia + serie zmęczeniowe (fatigue percent), autoregulacja przy gorszej dyspozycji.',
  'Częstotliwość (G. Nuckols, Stronger by Science): boje 2–3× w tygodniu z różnym bodźcem (ciężko / objętość / wariant), partie hipertroficzne 2× w tygodniu.',
  'Hipertrofia (B. Schoenfeld, J. Nippard): ~10–20 serii twardych na partię tygodniowo, praca w pozycji rozciągnięcia (stretch-mediated, lengthened partials), pełny zakres ruchu.',
  'Tempo i struktura (C. Poliquin): świadomie dobrane tempo (ekscentryk 3–4 s w hipertrofii, X w sile), zmiana bodźca co 2–6 tygodni, superserie antagonistyczne przy krótkim czasie, równowaga strukturalna (np. rotacja zewnętrzna barku vs wyciskanie).',
  'Powerbuilding (np. L. Norton, J. Nippard): sesja = bój główny ciężko (RTS) + wariant objętościowy + akcesoria hipertroficzne bliżej upadku; partie priorytetowe na początku sesji akcesoryjnej.',
  'Klatka piersiowa wymaga wyższej intensywności wysiłku: akcesoria na klatkę RIR 0–1 (ostatnia seria do upadku technicznego), duży zakres w rozciągnięciu (hantle, rozpiętki na wyciągu), 2× w tygodniu.',
  'Interferencja cardio z hipertrofią i siłą: preferuj cardio o niskim udarze (rower, wiosła, marsz pod górę) w Z1–Z2; bieganie i HIIT dalej od treningu nóg (min. 6 h, najlepiej inny dzień, nie przed ciężkim przysiadem/martwym); HIIT max 1–2× w tygodniu; przy rosnącej objętości biegowej obniż objętość nóg i dołóż kcal/węglowodany.',
  'Redukcja: utrzymaj intensywność bojów, tnij objętość akcesoriów najpierw; masa: progresja objętości partii priorytetowych.',
];

/** Żywienie, kofeina i zdrowie — AI ma tu pole do popisu (porady, okołotreningowo, kofeina). */
export const NUTRITION_PRINCIPLES = [
  'Kofeina: dobierz dawkę przedtreningową indywidualnie (punkt wyjścia ~3 mg/kg masy, 30–60 min przed; niższa przy małej tolerancji lub wysokim stresie), limit dzienny łącznie z kawą (≤ 400 mg dla zdrowych dorosłych), ostatnia kofeina ≥ 8–10 h przed snem — przy wieczornych treningach mniej albo bez. Uwzględnij obecne spożycie, porę treningu, jakość snu, stres i choroby/leki (nadciśnienie, arytmia, lęk → ostrożnie, wpisz w skipWhen/notes). Rozważ „przerwę od kofeiny" w deload i podbicie dawki na start/test maksów.',
  'Okołotreningowo (periWorkout + fueling sesji): konkretne posiłki z ilościami — węglowodany i białko przed (2–3 h) i po treningu, intra przy sesjach > 75–90 min albo długich biegach, elektrolity przy poceniu; więcej węglowodanów w dni high-carb.',
  'Porady wg fazy: redukcja (sytość, białko 2–2,4 g/kg, objętość jedzenia, refeed/diet break gdy spada wydajność lub sen), rekompozycja (kcal ~utrzymania, wysoki priorytet białka i snu, rozkład węgli wokół treningu), utrzymanie (elastyczność, monitoring masy), masa (powolna nadwyżka, gęstość kaloryczna, kontrola tłuszczu).',
  'Porady zdrowotne: błonnik 25–40 g, warzywa/owoce, omega-3 i ryby, witamina D jesienią/zimą, żelazo i wapń przy diecie roślinnej, ograniczenie alkoholu (sen, regeneracja), nawodnienie ~35 ml/kg + to, co tracone na treningu, szanuj nietolerancje i wykluczenia z profilu.',
  'Suplementacja tylko z mocnymi dowodami (kreatyna 3–5 g/d, kofeina, białko jako wygoda, witamina D przy niedoborze, omega-3) — bez obietnic; uwzględnij to, co zawodnik już bierze.',
  'Plan nie jest poradą medyczną: przy chorobach, lekach i ciąży zaznacz konsultację z lekarzem/dietetykiem klinicznym w tips (kategoria „zdrowie").',
];

export const PLAN_RULES = [
  'Zwróć WYŁĄCZNIE poprawny JSON zgodny ze schematem — bez komentarzy, bez markdown, bez tekstu przed i po.',
  'Tygodnie numeruj globalnie od 1 do horizonWeeks bez dziur; każdy tydzień należy do dokładnie jednego mezocyklu.',
  'Deload co 4–6 tygodni (isDeload: true, focus mezocyklu "deload" albo tydzień deload w mezocyklu) — obniż objętość o 30–50%.',
  'Jeśli jest data zawodów: ostatnie 1–2 tygodnie to "taper", a tydzień startu kończy się dniem zawodów (meta.competitionDate).',
  'Każde ćwiczenie MUSI mieć: sets, reps, rir i tempo (np. "20X1", "30X1", "3010"). Seria będzie pokazana jako ciężar · powtórzenia · tempo · RIR.',
  'Metodę ciężaru wybierasz Ty dla każdego ćwiczenia: "rts" (domyślna dla bojów — tabela RTS z reps + rir), "pct" (% e1RM, np. technika, przysiad przedni), "kg" (stały ciężar: maszyny, hantle, rehab), "formula" (własny wzór, gdy tabela nie pasuje — np. kontuzja, powrót po przerwie). Uzasadnij wybór w load.note. Ustaw "lift", gdy ciężar ma wynikać z e1RM boju.',
  'KONTUZJE MAJĄ PIERWSZEŃSTWO przed progresją: dla każdego ćwiczenia obciążającego obszar z sekcji „Kontuzje → dotknięte ćwiczenia" podejmij decyzję: zamień ćwiczenie, zmniejsz ciężar (adjustPct i/lub maxKg albo formula) lub zostaw z uzasadnieniem — i ZAWSZE wypełnij injuryNote.',
  'Naderwanie / zerwanie / ból ≥ 7/10: żadnej pracy z ciężarem obciążającej ten obszar (nie licz z e1RM) — tylko rehab/prehab z metodą "kg" (lekkie, guma) i adnotacja „do decyzji fizjoterapeuty"; progresuj obciążenie dopiero gdy ból ≤ 3.',
  'Prehab/rehab: dla każdej obecnej kontuzji dodaj w sesjach blok "prehab" z "target" = obszar; omijaj bolesne ruchy lub podaj warianty.',
  'Rozgrzewka (warmup) celowana w ograniczenia mobilności i bój dnia; cooldown krótki (3–8 min).',
  'Sesja nie może przekraczać dostępnego czasu; akcesoria z priority 3 to pierwsze do wycięcia.',
  'Żywienie: kcal wg fazy sylwetkowej i tempa; więcej węglowodanów (highCarbDays) w dni najcięższych sesji i długich biegów; białko 1,8–2,2 g/kg.',
  'Żywienie: wypełnij nutrition.caffeine, nutrition.periWorkout i co najmniej 6 nutrition.tips (faza + zdrowie + okołotreningowo); tygodnie z wyjątkami (deload, taper, start, choroba) mogą mieć microcycle.nutrition.tips, a kluczowe sesje — fueling.',
  'Sen: sleepTargetH min. 7–9 h, wyżej w tygodniach intensyfikacji i przed startem; kroki wg obecnej aktywności (+/- w redukcji).',
  'Cardio i bieganie dawkuj STREFAMI TĘTNA z sekcji „Strefy tętna" (pole zone "Z1".."Z5", w notes zakres bpm), nie tempem ani odczuciem; przy celu biegowym progresja długości biegu w "secondaryGoals.milestones".',
  'Sesje tylko w dniach z listy preferowanych dni; liczba sesji = dni treningowe w tygodniu.',
  'Nie używaj sprzętu spoza listy dostępnego sprzętu ani ćwiczeń zakazanych.',
  'Preferuj WOLNE CIĘŻARY i ruchy z masą ciała: sztanga, hantle, kettlebell, ławka, drążek, poręcze, guma. Maszyny i wyciągi tylko w ostateczności — gdy wolny ciężar jest niedostępny, przeciwwskazany przez kontuzję albo nie da się nim sensownie trafić w cel; wtedy uzasadnij wybór w notes.',
];

/** Prompt startowy: wygeneruj cały plan dla profilu. */
export function buildPlanPrompt(flow: FlowDef<AthleteProfile>, a: AthleteProfile, ctx: TypeContext): string {
  return [
    'Jesteś doświadczonym trenerem trójboju siłowego i powerbuildingu oraz dietetykiem sportowym.',
    'Na podstawie danych zawodnika ułóż periodyzowany plan: makrocykl → mezocykle → mikrocykle (tygodnie) → sesje,',
    'z deloadami, kaloriami i makro, strategią węglowodanów, celami snu i kroków, rozgrzewką, prehabem/rehabem i cardio.',
    '',
    `Data dzisiejsza: ${todayIso()}. Plan zaczyna się od najbliższego poniedziałku.`,
    '',
    '## Dane zawodnika',
    profileSummary(flow, a, ctx),
    '',
    ...injurySection(a),
    ...hrSection(a),
    '## Dane zawodnika (JSON)',
    JSON.stringify(promptProfile(a), null, 1),
    '',
    '## Format odpowiedzi (JSON)',
    PLAN_SCHEMA_TEXT,
    '',
    '## Zasady programowania (stosuj je, łącząc z danymi zawodnika)',
    ...COACHING_PRINCIPLES.map((r) => `- ${r}`),
    '',
    '## Żywienie, kofeina, zdrowie',
    ...NUTRITION_PRINCIPLES.map((r) => `- ${r}`),
    '',
    '## Reguły',
    ...PLAN_RULES.map((r, i) => `${i + 1}. ${r}`),
  ].join('\n');
}

/** Strefy tętna (Karvonen / % HRmax) — cardio w planie podawane w strefach. */
export function hrSection(a: AthleteProfile): string[] {
  const zones = hrZones(a);
  if (!zones.length) return ['## Strefy tętna', 'Brak danych (wiek / tętno) — cardio wg skali rozmowy (Z2 = da się mówić pełnymi zdaniami).', ''];
  const basis = a.tetno_spoczynkowe ? `Karvonen, HRrest ${a.tetno_spoczynkowe}` : '% HRmax';
  const max = Number(a.tetno_max) || Math.round(208 - 0.7 * (a.wiek ?? 30));
  return [
    `## Strefy tętna (HRmax ${max}${a.tetno_max ? ' z pomiaru' : ' z wieku (Tanaka)'}, ${basis})`,
    ...zones.map((z) => `- ${z.zone} ${z.label}: ${z.min}–${z.max} bpm`),
    '',
  ];
}

/**
 * Prompt korekty: obecny plan + logi + zgłoszone problemy → AI zwraca pełny plan
 * albo patch `{ "microcycles": [...] }` z podmienionymi tygodniami.
 */
export function buildCorrectionPrompt(
  flow: FlowDef<AthleteProfile>,
  a: AthleteProfile,
  ctx: TypeContext,
  plan: TrainingPlan,
  context: { fromWeek: number; logs: string[]; events: string[]; stats: string[] },
): string {
  return [
    'Jesteś trenerem prowadzącym tego zawodnika. Skoryguj plan od tygodnia ' + context.fromWeek + ' na podstawie wykonania i zgłoszeń.',
    'Zwróć WYŁĄCZNIE JSON: { "microcycles": Microcycle[], "nutrition"?: { caffeine, periWorkout, tips, baseline… } } z tygodniami od ' + context.fromWeek + ' (ten sam schemat co w planie).',
    'Nie zmieniaj tygodni wcześniejszych. Zachowaj strukturę mezocykli i daty. Każde ćwiczenie: rir, tempo, load.method + note; przy kontuzjach injuryNote.',
    '',
    '## Dane zawodnika',
    profileSummary(flow, a, ctx),
    '',
    ...injurySection(a),
    ...hrSection(a),
    '## Zasady programowania',
    ...COACHING_PRINCIPLES.map((r) => `- ${r}`),
    '',
    '## Żywienie, kofeina, zdrowie',
    ...NUTRITION_PRINCIPLES.map((r) => `- ${r}`),
    'Przy korekcie możesz zwrócić też { "nutrition": { … } } obok "microcycles", jeśli statystyki (makro, waga, sen) wymagają zmiany strategii.',
    '',
    '## Wykonane treningi (log)',
    context.logs.length ? context.logs.join('\n') : '(brak wpisów)',
    '',
    '## Statystyki (logi dzienne)',
    ...context.stats,
    '',
    '## Zdarzenia od ostatniego przegenerowania (waga × nasilenie × świeżość × ciągłość)',
    context.events.length ? context.events.join('\n') : '(brak)',
    '',
    'Uwzględnij: zgodność makro i trend masy (koryguj kcal), deficyt snu i stres (objętość, RIR), choroby i inne aktywności (deload / przesunięcie),',
    'kontuzje (zasady z „Kontuzje → dotknięte ćwiczenia"), wykonanie sesji i trend e1RM (progresja ciężarów).',
    '',
    '## Obecny plan (JSON)',
    JSON.stringify(plan),
  ].join('\n');
}

/** Sekcja promptu: każda kontuzja z dotkniętymi bojami i słowami-kluczami ćwiczeń (AI musi podjąć decyzję). */
export function injurySection(a: AthleteProfile): string[] {
  const list = a.kontuzje ?? [];
  if (!list.length) return ['## Kontuzje → dotknięte ćwiczenia', 'Brak obecnych kontuzji.', ''];
  return [
    '## Kontuzje → dotknięte ćwiczenia',
    ...list.map((k) => {
      const lifts = (AREA_LIFTS[k.obszar] ?? []).join(', ') || '—';
      const kw = (AREA_KEYWORDS[k.obszar] ?? []).join(', ');
      return (
        `- ${k.nazwa} (obszar: ${k.obszar || '?'}, strona: ${k.strona || '?'}, ból ${k.bol ?? '?'}/10, od: ${k.od_kiedy || '?'}` +
        `${k.diagnoza ? `, diagnoza: ${k.diagnoza}` : ''}${k.fizjo ? ', pod opieką fizjo' : ''})` +
        `${isSevere(k) ? ' — POWAŻNA: bez obciążania obszaru' : ''}\n  boje: ${lifts}; ćwiczenia zawierające: ${kw}` +
        `${k.ruchy_bolesne?.length ? `; bolesne ruchy: ${k.ruchy_bolesne.join(', ')}` : ''}`
      );
    }),
    '',
  ];
}

/** „Grupa: etykieta — wartość" dla wszystkich odpowiedzianych pól (czytelne dla AI i trenera). */
export function profileSummary(flow: FlowDef<AthleteProfile>, a: AthleteProfile, ctx: TypeContext): string {
  const lines: string[] = [];
  for (const group of flow.groups) {
    const rows: string[] = [];
    for (const step of flow.steps.filter((s) => s.group === group.id)) {
      if (step.collection) {
        const items = (a[step.collection.target as keyof AthleteProfile] as unknown[] | null) ?? [];
        rows.push(`- ${step.collection.sheetLabel}: ${items.length ? '' : 'brak'}`);
        for (const item of items as Record<string, unknown>[]) {
          const parts = step.collection.itemFields
            .map((f) => [f.label, fieldDisplay(f, item as never, ctx)])
            .filter(([, v]) => v)
            .map(([l, v]) => `${l}: ${v}`);
          rows.push(`  - ${step.collection.itemLabel(item as never)} (${parts.join('; ')})`);
        }
        continue;
      }
      for (const f of step.fields) {
        const v = fieldDisplay(f, a, ctx);
        if (v) rows.push(`- ${f.sheetLabel ?? f.label}: ${v}`);
      }
    }
    if (rows.length) lines.push(`### ${group.label}`, ...rows);
  }
  return lines.join('\n');
}

/** Profil w formie dla AI: e1RM policzone, serie jako tekst. */
function promptProfile(a: AthleteProfile): Record<string, unknown> {
  const lift = (l: unknown) => (l && typeof l === 'object' ? { seria: formatLift(l), e1rm: e1rm(l as never) } : null);
  return { ...a, squat: lift(a.squat), bench: lift(a.bench), deadlift: lift(a.deadlift), ohp: lift(a.ohp) };
}
