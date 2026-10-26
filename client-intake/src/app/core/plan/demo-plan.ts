import { estimateTdee, pctForRir } from '../domain/calc';
import { injuryFor, isSevere } from '../domain/injuries';
import { normalize } from '../engine/text';
import { AthleteProfile } from '../models/athlete.model';
import {
  CardioSession,
  DayCode,
  Drill,
  ExerciseBlock,
  Macros,
  Mesocycle,
  Microcycle,
  NutritionTip,
  PhaseFocus,
  Session,
  TrainingPlan,
} from '../models/plan.model';

/*
 * DEMO: deterministyczny plan „jak z AI" zbudowany z profilu — do komendy `demo` w widoku planu,
 * testów walidatora i docs/samples/plan.example.json. Nie zastępuje AI: proste reguły periodyzacji.
 */

interface PhaseSpec {
  focus: PhaseFocus;
  name: string;
  weeks: number;
  /** Ostatni tydzień fazy = deload. */
  deloadLast?: boolean;
}

const PL_PHASES: PhaseSpec[] = [
  { focus: 'accumulation', name: 'Akumulacja', weeks: 5, deloadLast: true },
  { focus: 'intensification', name: 'Intensyfikacja', weeks: 5, deloadLast: true },
  { focus: 'realization', name: 'Realizacja', weeks: 2 },
  { focus: 'taper', name: 'Taper', weeks: 2 },
];

const PB_PHASES: PhaseSpec[] = [
  { focus: 'hypertrophy', name: 'Hipertrofia', weeks: 5, deloadLast: true },
  { focus: 'accumulation', name: 'Siła bazowa', weeks: 5, deloadLast: true },
  { focus: 'intensification', name: 'Siła + objętość', weeks: 4, deloadLast: true },
  { focus: 'realization', name: 'Test maksów', weeks: 2 },
];

const DEFAULT_DAYS: Record<number, DayCode[]> = {
  2: ['pn', 'cz'],
  3: ['pn', 'sr', 'pt'],
  4: ['pn', 'wt', 'cz', 'so'],
  5: ['pn', 'wt', 'sr', 'pt', 'so'],
  6: ['pn', 'wt', 'sr', 'cz', 'pt', 'so'],
};

/** Najbliższy poniedziałek (ISO) od daty. */
export function nextMonday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 1 ? 0 : add));
  return d.toISOString().slice(0, 10);
}

export function buildDemoPlan(a: AthleteProfile, startDate = nextMonday()): TrainingPlan {
  const pl = a.cel_glowny !== 'powerbuilding';
  const phases = fitPhases(pl ? PL_PHASES : PB_PHASES, horizon(a, startDate));
  const total = phases.reduce((s, p) => s + p.weeks, 0);
  const tdee = estimateTdee(a) ?? 2600;
  const kg = a.masa_kg ?? 80;
  const deficit = a.faza === 'redukcja' ? -Math.round((kg * 7700 * (a.tempo ?? 0.5)) / 100 / 7 / 50) * 50 : 0;
  const surplus = a.faza === 'masa' ? Math.round((kg * 7700 * (a.tempo ?? 0.5)) / 100 / 7 / 50) * 50 : 0;
  const base = macros(tdee + deficit + surplus, kg);
  const days = pickDays(a);
  const injuries = (a.kontuzje ?? []).map((k) => k.obszar || k.nazwa);
  const running = (a.cele_dodatkowe ?? []).find((g) => g.typ === 'bieg');

  let week = 0;
  const mesocycles: Mesocycle[] = phases.map((p, pi) => {
    const kcalAdjust = p.focus === 'taper' || p.focus === 'realization' ? Math.max(deficit, -150) - deficit : 0;
    const microcycles: Microcycle[] = [];
    for (let i = 0; i < p.weeks; i++) {
      week++;
      const deload = !!p.deloadLast && i === p.weeks - 1;
      const progress = p.weeks > 1 ? i / (p.weeks - 1) : 1;
      microcycles.push(
        microcycle(a, {
          week,
          focus: p.focus,
          deload,
          progress,
          days,
          base,
          kcalAdjust,
          injuries,
          running: running ? runFor(week, total) : null,
          last: week === total,
        }),
      );
    }
    return {
      id: `m${pi + 1}`,
      name: p.name,
      focus: p.focus,
      notes: PHASE_NOTES[p.focus],
      kcalAdjust,
      carbStrategy:
        p.focus === 'taper'
          ? 'Ładowanie węglowodanów 2 dni przed startem (7–8 g/kg), lekkostrawnie.'
          : 'Więcej węglowodanów w dni ciężkich przysiadów i martwego (+30%), mniej w dni wolne.',
      sleepTargetH: p.focus === 'intensification' || p.focus === 'realization' || p.focus === 'taper' ? 8.5 : 8,
      microcycles,
    };
  });

  return {
    meta: {
      version: '1',
      athlete: a.imie || 'zawodnik',
      generatedAt: new Date().toISOString(),
      startDate,
      horizonWeeks: total,
      goal: pl
        ? `Powerlifting${a.cel_total_kg ? ` — total ${a.cel_total_kg} kg` : ''}${a.kategoria_wagowa ? ` w kat. ${a.kategoria_wagowa} kg` : ''}`
        : `Powerbuilding ${a.proporcja ?? '50/50'} — priorytety: ${(a.partie_priorytetowe ?? []).join(', ') || 'brak'}`,
      competitionDate: a.data_zawodow || null,
      notes: ['Plan demonstracyjny wygenerowany lokalnie (komenda „demo") — do zastąpienia odpowiedzią AI.'],
    },
    nutrition: {
      tdee,
      baseline: base,
      rules: [
        `Białko ${Math.round(kg * 2)} g dziennie, rozłożone na ${a.posilki_dziennie ?? 4} posiłki.`,
        a.faza === 'redukcja' ? `Deficyt ~${-deficit} kcal; w deload kcal bez zmian (nie tniemy dalej).` : 'Kalorie na poziomie bilansu / lekkiej nadwyżki.',
        'Posiłek z węglowodanami 2–3 h przed treningiem.',
      ],
      caffeine: caffeinePlan(a),
      periWorkout: {
        pre: `2–3 h wcześniej: ${Math.round(kg * 0.5)}–${Math.round(kg * 1)} g węglowodanów + 30–40 g białka, mało tłuszczu i błonnika`,
        intra: 'Sesje > 90 min: 20–30 g węglowodanów (napój izotoniczny) + elektrolity',
        post: `W ciągu 2 h: 30–40 g białka + ${Math.round(kg * 0.8)}–${Math.round(kg * 1.2)} g węglowodanów`,
      },
      tips: nutritionTips(a, total),
    },
    macrocycles: [{ id: 'M1', name: pl ? 'Przygotowanie do startu' : 'Blok powerbuilding', goal: pl ? 'Peak na zawody' : 'Siła + hipertrofia', mesocycles }],
    secondaryGoals: (a.cele_dodatkowe ?? []).map((g) => ({
      goal: g.nazwa,
      type: g.typ,
      milestones: [
        { week: Math.max(1, Math.round(total / 3)), target: g.typ === 'bieg' ? 'długi bieg 12 km' : `etap 1 — ${g.cel || 'technika'}` },
        { week: Math.max(2, Math.round((2 * total) / 3)), target: g.typ === 'bieg' ? 'długi bieg 17 km' : 'etap 2 — objętość' },
        { week: total, target: g.cel || g.nazwa },
      ],
    })),
  };
}

/* ---------- Tydzień ---------- */

interface WeekCtx {
  week: number;
  focus: PhaseFocus;
  deload: boolean;
  progress: number;
  days: DayCode[];
  base: Macros;
  kcalAdjust: number;
  injuries: string[];
  running: number | null;
  last: boolean;
}

function microcycle(a: AthleteProfile, w: WeekCtx): Microcycle {
  const vol = w.deload ? 0.45 : VOLUME[w.focus] - w.progress * 0.15;
  const int = w.deload ? 0.5 : INTENSITY[w.focus] + w.progress * 0.1;
  const training = macros(w.base.kcal + w.kcalAdjust + 150, a.masa_kg ?? 80, 1.15);
  const rest = macros(w.base.kcal + w.kcalAdjust - 150, a.masa_kg ?? 80, 0.85);
  const sessions = w.days.map((day, i) => session(a, day, i, w));
  const heavy = sessions.filter((s) => /przysiad|martwy/i.test(s.name)).map((s) => s.day);
  const cardio: CardioSession[] = [];
  const off = (['pn', 'wt', 'sr', 'cz', 'pt', 'so', 'nd'] as DayCode[]).filter((d) => !w.days.includes(d));
  if (w.running) {
    cardio.push({ day: off[0] ?? 'nd', type: 'Bieg długi', minutes: Math.round(w.running * 6), zone: 'Z2', notes: `${w.running} km spokojnie` });
    cardio.push({ day: w.days[1], type: 'Bieg tempo', minutes: 30, zone: 'Z3', notes: 'rano, min. 6 h przed siłą' });
  } else {
    cardio.push({ day: off[0] ?? 'nd', type: (a.cardio_preferencje ?? [])[0] === 'rower' ? 'Rower' : 'Spacer / LISS', minutes: w.deload ? 30 : 40, zone: 'Z2' });
  }
  return {
    week: w.week,
    isDeload: w.deload,
    volumeIndex: round2(Math.min(1, Math.max(0.2, vol))),
    intensityIndex: round2(Math.min(1, Math.max(0.3, int))),
    label: w.deload ? 'Deload' : w.last && a.data_zawodow ? 'Tydzień startu' : `${FOCUS_SHORT[w.focus]} ${Math.round(w.progress * 100)}%`,
    nutrition: {
      trainingDay: training,
      restDay: rest,
      highCarbDays: heavy.length ? heavy : [w.days[0]],
      tips: w.deload
        ? ['Deload: kcal bez zmian, kofeina tylko z porannej kawy — reset tolerancji przed kolejnym blokiem.']
        : w.focus === 'taper'
          ? ['Taper: utrzymaj kcal, więcej węglowodanów 2 dni przed startem, bez nowych produktów.']
          : undefined,
    },
    recovery: {
      sleepH: w.focus === 'taper' || w.focus === 'realization' ? 8.5 : 8,
      steps: a.faza === 'redukcja' ? Math.max(8000, (a.kroki_dziennie ?? 6000) + 2000) : Math.max(7000, a.kroki_dziennie ?? 7000),
      notes: w.deload ? 'Deload: dodatkowa godzina snu, sauna / spacer.' : undefined,
    },
    cardio,
    sessions,
  };
}

/* ---------- Sesja ---------- */

function session(a: AthleteProfile, day: DayCode, index: number, w: WeekCtx): Session {
  const kind = SPLIT[w.days.length]?.[index] ?? 'full';
  const rpe = w.deload ? 6 : Math.min(9.5, RPE_BASE[w.focus] + w.progress);
  const reps = w.deload ? 3 : REPS[w.focus];
  const sets = w.deload ? 2 : SETS[w.focus];
  const usePct = a.znajomosc_rpe === 'nie' || a.styl_programu === 'pct';
  const rir = Math.max(0, round05(10 - rpe));
  /** Boje: tabela RTS (albo % dla osób bez RPE). */
  const lift = (r: number, rr: number): Pick<ExerciseBlock, 'rir' | 'load'> =>
    usePct
      ? { rir: rr, load: { method: 'pct', value: Math.round(pctForRir(r, rr) * 100), note: '% e1RM — zawodnik nie zna RPE' } }
      : { rir: rr, load: { method: 'rts', note: 'tabela RTS z e1RM' } };
  /** Akcesoria: ciężar dobierany na RIR (bez boju bazowego). */
  const feel = (rr: number): Pick<ExerciseBlock, 'rir' | 'load'> => ({ rir: rr, load: { method: 'rts', note: 'dobierz ciężar na RIR' } });
  const main: ExerciseBlock[] = [];
  const acc: ExerciseBlock[] = [];
  const knee = w.injuries.includes('kolano');
  const back = w.injuries.includes('ledzwia');

  if (w.last && a.data_zawodow && index === w.days.length - 1) {
    const attempt = (exercise: string, l: ExerciseBlock['lift']): ExerciseBlock => ({
      exercise,
      lift: l,
      sets: 3,
      reps: 1,
      rir: 0,
      tempo: '20X0',
      load: { method: 'pct', value: 98, note: 'trzecie podejście ~98–102% e1RM wg dyspozycji' },
      priority: 1,
    });
    return {
      day,
      name: 'ZAWODY',
      focus: 'start',
      durationMin: 240,
      warmup: [{ name: 'Rozgrzewka startowa wg planu podejść', notes: 'otwarcia ~92% e1RM' }],
      prehab: [],
      main: [attempt('Przysiad — 3 podejścia', 'squat'), attempt('Wyciskanie — 3 podejścia', 'bench'), attempt('Martwy — 3 podejścia', 'deadlift')].map((b) => {
        const k = injuryFor(b, a.kontuzje ?? []);
        return k ? { ...b, injuryNote: `${k.nazwa} (ból ${k.bol ?? '?'}/10): otwarcie zachowawczo, decyzja o 2./3. podejściu po rozgrzewce` } : b;
      }),
      accessories: [],
      cooldown: [],
      fueling: {
        pre: '3 h przed ważeniem / startem: znany, lekkostrawny posiłek (ryż, białko, mało tłuszczu)',
        intra: 'Między bojami: 20–40 g węglowodanów co ~60 min (żelki, banan, izotonik) + elektrolity',
        post: 'Po starcie: pełny posiłek, nawodnienie',
        caffeineMg: Math.min(caffeinePlan(a).dailyMaxMg, caffeinePlan(a).preWorkoutMg + 100),
      },
      notes: 'Jedz między bojami, nawadnianie z elektrolitami. Kofeinę podziel: część przed przysiadem, reszta przed martwym.',
    };
  }

  if (kind === 'sq' || kind === 'full') {
    main.push({ exercise: knee ? 'Przysiad z pauzą (box do równoległej)' : 'Przysiad', lift: 'squat', sets, reps, tempo: knee ? '31X1' : '20X1', ...lift(reps, rir), restSec: 240, priority: 1 });
    main.push({ exercise: 'Wyciskanie leżąc — wolumen', lift: 'bench', sets: sets + 1, reps: reps + 2, tempo: '2110', ...lift(reps + 2, rir + 1), restSec: 180, priority: 1 });
    acc.push({ exercise: knee ? 'Hip thrust' : 'Bułgarski przysiad', sets: 3, reps: '8-10', tempo: '2011', ...feel(2), restSec: 90, priority: 2 });
    acc.push({ exercise: 'Wiosłowanie hantlem', sets: 3, reps: '10-12', tempo: '2011', ...feel(2), restSec: 90, priority: 2 });
    acc.push({ exercise: 'Plank z obciążeniem', sets: 3, reps: '30 s', tempo: '0000', ...feel(3), priority: 3 });
  } else if (kind === 'bp') {
    main.push({ exercise: 'Wyciskanie leżąc', lift: 'bench', sets, reps, tempo: '21X1', ...lift(reps, rir), restSec: 240, priority: 1 });
    main.push({ exercise: 'OHP', lift: 'ohp', sets: 3, reps: 6, tempo: '20X1', ...lift(6, rir + 1), restSec: 150, priority: 2 });
    acc.push({ exercise: 'Podciąganie', sets: 4, reps: '6-8', tempo: '20X1', ...feel(2), restSec: 120, priority: 2 });
    acc.push({ exercise: 'Wyciskanie francuskie', sets: 3, reps: '10-12', tempo: '3010', ...feel(2), restSec: 75, priority: 3 });
    acc.push({ exercise: 'Face pull', sets: 3, reps: '15', tempo: '2012', ...feel(3), restSec: 60, priority: 3 });
  } else if (kind === 'dl') {
    main.push({ exercise: back ? 'Martwy ciąg z bloków' : `Martwy ciąg${a.deadlift_styl === 'sumo' ? ' sumo' : ''}`, lift: 'deadlift', sets: Math.max(2, sets - 1), reps, tempo: '10X0', ...lift(reps, rir), restSec: 300, priority: 1 });
    main.push({ exercise: 'Przysiad przedni', lift: 'squat', sets: 3, reps: 5, rir: 3, tempo: '30X1', load: { method: 'pct', value: 65, note: '% e1RM przysiadu — technika, nie ma tabeli dla przedniego' }, restSec: 180, priority: 2 });
    acc.push({ exercise: 'Rumuński martwy ciąg', sets: 3, reps: '8', tempo: '3010', ...feel(3), restSec: 120, priority: 2 });
    acc.push({ exercise: 'Ściąganie drążka', sets: 3, reps: '10-12', tempo: '2011', ...feel(2), restSec: 75, priority: 3 });
  } else {
    main.push({ exercise: 'Wyciskanie wąsko', lift: 'bench', sets: 4, reps: 6, tempo: '2010', rir: rir + 0.5, load: { method: 'formula', expr: 'e1rm * 0.92 * 0.78', note: 'wąski chwyt ≈ 92% e1RM wyciskania, 6 powt. ≈ 78%' }, restSec: 180, priority: 1 });
    main.push({ exercise: 'Przysiad tempo', lift: 'squat', sets: 3, reps: 4, rir: 4, tempo: '3110', load: { method: 'pct', value: 70, note: 'tempo wymusza mniejszy ciężar niż tabela' }, restSec: 180, priority: 2 });
    acc.push({ exercise: 'Wznosy bokiem', sets: 4, reps: '12-15', tempo: '2011', ...feel(1), restSec: 60, priority: 2 });
    acc.push({ exercise: 'Uginanie ze sztangą', sets: 3, reps: '10', tempo: '2011', ...feel(2), restSec: 60, priority: 3 });
  }

  for (const g of a.cele_dodatkowe ?? []) {
    if (g.typ === 'skill' && index % 2 === 0) acc.unshift({ exercise: `${g.nazwa} — praktyka`, sets: 5, reps: '20-30 s', tempo: '0000', rir: 3, load: { method: 'kg', note: 'masa ciała' }, priority: 2, notes: 'na świeżo, przed akcesoriami' });
    if (g.typ === 'boj' && index === 0) acc.unshift({ exercise: g.nazwa, sets: 4, reps: 3, tempo: '31X1', ...feel(3), priority: 2, notes: `cel: ${g.cel}` });
  }

  // Kontuzje: decyzja dla każdego dotkniętego ćwiczenia (jak ma robić AI — reguły promptu).
  const injuries = a.kontuzje ?? [];
  const decide = (b: ExerciseBlock): ExerciseBlock => {
    const k = injuryFor(b, injuries);
    if (!k) return b;
    if (isSevere(k)) {
      const rehab = PREHAB[k.obszar]?.name ?? `Praca nad: ${k.nazwa}`;
      return {
        exercise: `${rehab} (zamiast: ${b.exercise})`,
        lift: null,
        sets: 3,
        reps: '12-15',
        rir: 4,
        tempo: '3030',
        load: { method: 'kg', note: 'guma / bez obciążenia' },
        injuryNote: `${k.nazwa}: ${k.diagnoza || `ból ${k.bol}/10`} — bez obciążania obszaru do decyzji fizjoterapeuty`,
        priority: b.priority,
      };
    }
    const cut = (k.bol ?? 0) >= 4 ? -25 : -10;
    return {
      ...b,
      rir: Math.max(b.rir ?? 2, (k.bol ?? 0) >= 4 ? 4 : 3),
      load: { ...b.load, adjustPct: cut },
      injuryNote: `${k.nazwa} (ból ${k.bol ?? '?'}/10): ciężar ${cut}%, min. RIR ${(k.bol ?? 0) >= 4 ? 4 : 3}, przerwij przy bólu > 3/10`,
    };
  };
  main.splice(0, main.length, ...main.map(decide));
  acc.splice(0, acc.length, ...acc.map(decide));

  const prehab: Drill[] = (a.kontuzje ?? []).map((k) => PREHAB[k.obszar] ?? { name: `Praca nad: ${k.nazwa}`, sets: 2, reps: '12', target: k.nazwa }).map((d) => ({ ...d, target: d.target ?? 'prehab' }));
  const warmup: Drill[] = [
    { name: 'Rower / wiosła', durationSec: 300, notes: 'tętno ~120' },
    ...(a.ograniczenia_ruchowe ?? []).map((o) => MOBILITY[o]).filter(Boolean),
    { name: 'Serie rozgrzewkowe boju', sets: 4, reps: '5-3-2-1', notes: '40% → 85% ciężaru roboczego' },
  ];
  const duration = Math.min(a.czas_sesji_min ?? 90, 15 + main.length * 20 + acc.length * 8);

  return {
    day,
    name: SPLIT_NAMES[kind],
    focus: w.deload ? 'deload' : w.focus,
    durationMin: duration,
    warmup,
    prehab,
    main,
    accessories: w.deload ? acc.slice(0, 2).map((x) => ({ ...x, sets: Math.max(1, x.sets - 1) })) : acc,
    cooldown: [{ name: 'Oddychanie przeponowe 90/90', durationSec: 180 }],
  };
}

/* ---------- Żywienie ---------- */

/** Kofeina z profilu: ~3 mg/kg, mniej przy małej tolerancji, stresie, wieczornym treningu, chorobach z ryzykiem. */
function caffeinePlan(a: AthleteProfile) {
  const kg = a.masa_kg ?? 80;
  const risky = /nadcisn|cisnien|arytm|serc|lek|panik|ciaz|bezsenn/.test(normalize(a.choroby_leki ?? ''));
  let perKg = a.kofeina === 'brak' ? 2 : a.kofeina === '3+' ? 4 : 3;
  if ((a.stres ?? 0) >= 7 || (a.jakosc_snu ?? 10) <= 5) perKg -= 1;
  if (a.pora_treningu === 'wieczor') perKg = Math.min(perKg, 2);
  if (risky) perKg = Math.min(perKg, 1.5);
  return {
    preWorkoutMg: Math.round((kg * perKg) / 25) * 25,
    minutesBefore: 45,
    dailyMaxMg: risky ? 200 : 400,
    cutoffHoursBeforeSleep: a.pora_treningu === 'wieczor' ? 6 : 9,
    skipWhen: [
      'tygodnie deload (reset tolerancji)',
      ...(a.pora_treningu === 'wieczor' ? ['trening później niż 6 h przed snem — wersja bez kofeiny lub 50 mg'] : []),
      ...((a.jakosc_snu ?? 10) <= 5 ? ['noc < 6 h snu — nie kompensuj kofeiną ponad dawkę przedtreningową'] : []),
      ...(risky ? [`zgłoszone: ${a.choroby_leki} — dawka i ewentualne odstawienie po konsultacji z lekarzem`] : []),
    ],
    notes: [`Liczone ~${perKg} mg/kg (spożycie: ${a.kofeina || 'brak danych'}), poranna kawa wlicza się do limitu.`],
  };
}

function nutritionTips(a: AthleteProfile, total: number): NutritionTip[] {
  const kg = a.masa_kg ?? 80;
  const phase: Record<string, NutritionTip> = {
    redukcja: { category: 'faza', title: 'Redukcja bez utraty siły', text: `Białko ${Math.round(kg * 2.2)} g, dużo warzyw dla sytości, węglowodany przesunięte wokół treningu. Gdy siła spada 2 tygodnie z rzędu albo sen się psuje — 1 tydzień na kcal utrzymania (diet break).`, priority: 1 },
    rekompozycja: { category: 'faza', title: 'Rekompozycja: kcal ~utrzymania', text: `Białko ${Math.round(kg * 2)} g, węglowodany głównie przed i po treningu, w dni wolne więcej tłuszczu i warzyw. Oceniaj obwody i siłę, nie samą wagę.`, priority: 1 },
    utrzymanie: { category: 'faza', title: 'Utrzymanie', text: 'Masa w widełkach ±1 kg od średniej tygodniowej; elastyczność 80/20, stałe godziny posiłków przed treningiem.', priority: 1 },
    masa: { category: 'faza', title: 'Masa: powolna nadwyżka', text: `Cel +${a.tempo ?? 0.5}% masy/tydz. Gęstsze kalorycznie posiłki (orzechy, oliwa, płatki), jeśli trudno dojeść.`, priority: 1 },
  };
  return [
    phase[a.faza] ?? phase['utrzymanie'],
    { category: 'okolotreningowo', title: 'Węglowodany wokół ciężkich dni', text: 'W dni high-carb większość węglowodanów w posiłku przed i po treningu; przed przysiadem i martwym nie trenuj na czczo.', priority: 1 },
    { category: 'zdrowie', title: 'Błonnik i mikroelementy', text: '25–40 g błonnika dziennie, 2 porcje owoców i 400 g+ warzyw; ryby 2× w tygodniu (omega-3).', priority: 2 },
    { category: 'zdrowie', title: 'Witamina D', text: 'Jesienią i zimą rozważ suplementację wit. D (najlepiej po badaniu 25(OH)D).', priority: 3 },
    { category: 'nawodnienie', title: 'Nawodnienie', text: `~${Math.round(kg * 35 / 100) / 10} l wody dziennie + 0,5–0,75 l na godzinę treningu; jasny kolor moczu.`, priority: 2 },
    { category: 'suplementacja', title: 'Kreatyna', text: '3–5 g kreatyny monohydrat codziennie, o dowolnej porze — także w deload i dni wolne.', priority: 2 },
    { category: 'sen', title: 'Kolacja a sen', text: 'Ostatni większy posiłek 2–3 h przed snem; alkohol obniża jakość snu i regenerację.', priority: 3 },
    ...(a.nietolerancje ? [{ category: 'zdrowie' as const, title: 'Wykluczenia', text: `Plan omija: ${a.nietolerancje}. Zadbaj o zamienniki wapnia i białka.`, priority: 2 as const }] : []),
    { category: 'okolotreningowo', title: 'Tydzień startu', text: 'Bez nowych produktów, więcej węglowodanów 2 dni przed startem, na zawody spakowane sprawdzone przekąski i elektrolity.', priority: 1, weeks: [Math.max(1, total - 1), total] },
  ];
}

/* ---------- Pomocnicze ---------- */

const VOLUME: Record<PhaseFocus, number> = { accumulation: 0.95, hypertrophy: 1, intensification: 0.7, realization: 0.45, taper: 0.35, deload: 0.45 };
const INTENSITY: Record<PhaseFocus, number> = { accumulation: 0.6, hypertrophy: 0.5, intensification: 0.78, realization: 0.9, taper: 0.85, deload: 0.5 };
const RPE_BASE: Record<PhaseFocus, number> = { accumulation: 7, hypertrophy: 7.5, intensification: 8, realization: 8.5, taper: 7, deload: 6 };
const REPS: Record<PhaseFocus, number> = { accumulation: 6, hypertrophy: 8, intensification: 3, realization: 2, taper: 2, deload: 3 };
const SETS: Record<PhaseFocus, number> = { accumulation: 5, hypertrophy: 4, intensification: 4, realization: 3, taper: 2, deload: 2 };
const FOCUS_SHORT: Record<PhaseFocus, string> = { accumulation: 'Akum.', hypertrophy: 'Hiper.', intensification: 'Intens.', realization: 'Real.', taper: 'Taper', deload: 'Deload' };
const PHASE_NOTES: Record<PhaseFocus, string> = {
  accumulation: 'Budowanie objętości i techniki, RPE 7–8.',
  hypertrophy: 'Objętość na partie priorytetowe, 8–12 powt.',
  intensification: 'Spadek objętości, ciężkie trójki i dwójki.',
  realization: 'Single i podwójne blisko maksa, ćwiczenie startowe.',
  taper: 'Zrzut zmęczenia, świeżość na start.',
  deload: 'Regeneracja.',
};

const SPLIT: Record<number, string[]> = {
  2: ['full', 'dl'],
  3: ['sq', 'bp', 'dl'],
  4: ['sq', 'bp', 'dl', 'pb'],
  5: ['sq', 'bp', 'dl', 'pb', 'bp'],
  6: ['sq', 'bp', 'dl', 'pb', 'sq', 'bp'],
};
const SPLIT_NAMES: Record<string, string> = {
  sq: 'Przysiad + wyciskanie',
  bp: 'Wyciskanie + góra',
  dl: 'Martwy ciąg + tył',
  pb: 'Wyciskanie wąsko + akcesoria',
  full: 'Full body',
};

const PREHAB: Record<string, Drill> = {
  kolano: { name: 'Izometria — przysiad hiszpański', sets: 5, durationSec: 45, target: 'kolano' },
  bark: { name: 'Rotacja zewnętrzna z gumą', sets: 3, reps: '15', target: 'bark' },
  lokiec: { name: 'Ekscentryczne prostowanie z gumą (tricepsy)', sets: 3, reps: '15', target: 'łokieć' },
  ledzwia: { name: 'McGill big 3', sets: 3, reps: '8-10 s x 5', target: 'odc. lędźwiowy' },
  biodro: { name: 'Copenhagen plank', sets: 3, durationSec: 20, target: 'biodro' },
  nadgarstek: { name: 'Rolki nadgarstka / wyprosty', sets: 2, reps: '15', target: 'nadgarstek' },
  kostka: { name: 'Wspięcia na jednej nodze (wolne)', sets: 3, reps: '12', target: 'kostka' },
};
const MOBILITY: Record<string, Drill> = {
  kostka: { name: 'Mobilizacja kostki przy ścianie', sets: 2, reps: '10/str.' },
  biodra: { name: '90/90 + rotacje bioder', sets: 2, reps: '8/str.' },
  barki: { name: 'Dislokacje z gumą', sets: 2, reps: '15' },
  piersiowy: { name: 'Rotacje piersiowe w klęku (open book)', sets: 2, reps: '8/str.' },
  dwuglowe: { name: 'Nożyce z gumą (hamstring floss)', sets: 2, reps: '10/str.' },
};

function macros(kcal: number, kg: number, carbFactor = 1): Macros {
  const protein = Math.round(kg * 2);
  const fat = Math.round(kg * 0.9);
  const carbs = Math.max(80, Math.round(((kcal - protein * 4 - fat * 9) / 4) * carbFactor));
  return { kcal: Math.round(protein * 4 + fat * 9 + carbs * 4), protein, carbs, fat };
}

function pickDays(a: AthleteProfile): DayCode[] {
  const n = a.dni_w_tygodniu ?? 4;
  const pref = (a.preferowane_dni ?? []) as DayCode[];
  return pref.length >= n ? pref.slice(0, n) : (DEFAULT_DAYS[n] ?? DEFAULT_DAYS[4]);
}

function horizon(a: AthleteProfile, startDate: string): number {
  if (a.data_zawodow) return Math.max(4, Math.ceil((Date.parse(a.data_zawodow) - Date.parse(startDate)) / (7 * 864e5)));
  return a.horyzont_tyg ?? 12;
}

/** Skaluje fazy do horyzontu (proporcjonalnie, min. 1 tydzień na fazę). */
function fitPhases(phases: PhaseSpec[], weeks: number): PhaseSpec[] {
  const base = phases.reduce((s, p) => s + p.weeks, 0);
  const out = phases.map((p) => ({ ...p, weeks: Math.max(1, Math.round((p.weeks * weeks) / base)) }));
  let diff = weeks - out.reduce((s, p) => s + p.weeks, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % out.length) {
    if (diff > 0) {
      out[i].weeks++;
      diff--;
    } else if (out[i].weeks > 1) {
      out[i].weeks--;
      diff++;
    }
  }
  return out;
}

function runFor(week: number, total: number): number {
  return Math.round(8 + (13 * week) / total);
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round05 = (v: number) => Math.round(v * 2) / 2;
