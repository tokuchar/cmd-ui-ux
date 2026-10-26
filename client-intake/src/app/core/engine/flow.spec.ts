import { DICTIONARIES } from '../config/dictionaries.config';
import { buildFlow, profileIssues } from '../config/flow.config';
import { FAKE_PRESETS } from '../config/fake-data.config';
import { AthleteProfile, emptyAthlete } from '../models/athlete.model';
import { applyComputed, applyField, evaluateField, fieldPrefill, isFieldComplete } from './field-runtime';
import { TypeContext } from './field-types';
import { askedPositions, findField, firstOpenPosition, groupProgress, totalProgress } from './flow';

const ctx: TypeContext = { dictionary: (k) => DICTIONARIES[k] ?? [] };
const flow = buildFlow();
const fieldOf = (id: string) => {
  const p = findField(flow, id)!;
  return flow.steps[p.step].fields[p.field];
};
const filled = (patch: Partial<AthleteProfile>): AthleteProfile => applyComputed(flow, { ...emptyAthlete(), ...patch });
const askedIds = (m: AthleteProfile) =>
  askedPositions(flow, m)
    .filter((p) => p.field >= 0)
    .map((p) => flow.steps[p.step].fields[p.field].id);

describe('sport intake flow', () => {
  it('asks competition questions only for powerlifting, proportion only for powerbuilding', () => {
    const pl = askedIds(filled({ cel_glowny: 'powerlifting' }));
    expect(pl).toContain('federacja');
    expect(pl).not.toContain('proporcja');
    const pb = askedIds(filled({ cel_glowny: 'powerbuilding' }));
    expect(pb).toContain('proporcja');
    expect(pb).not.toContain('federacja');
  });

  it('asks for visual bodyfat only when the percentage is unknown, horizon only without a meet date', () => {
    expect(askedIds(filled({}))).not.toContain('bodyfat_zakres');
    expect(askedIds(filled({ bodyfat_pct: '' }))).toContain('bodyfat_zakres');
    expect(askedIds(filled({ cel_glowny: 'powerlifting', data_zawodow: '' }))).toContain('horyzont_tyg');
    expect(askedIds(filled({ cel_glowny: 'powerlifting', data_zawodow: '2030-01-01' }))).not.toContain('horyzont_tyg');
  });

  it('running goal adds running-day questions', () => {
    const goals = [{ id: 'p', nazwa: 'półmaraton', typ: 'bieg', aktualnie: '', cel: '2:00:00', termin: '', priorytet: 'wysoki' }];
    expect(askedIds(filled({ cele_dodatkowe: goals }))).toContain('dni_biegowe');
    expect(askedIds(filled({ cele_dodatkowe: [] }))).not.toContain('dni_biegowe');
  });

  it('computes age, e1RM, total and TDEE without asking', () => {
    const m = filled({ data_urodzenia: '1995-04-12', squat: { kg: 180, reps: 3, rpe: 8 }, bench: { kg: 120, reps: 1, rpe: null }, deadlift: { kg: 200, reps: 5, rpe: 10 } });
    expect(m.wiek).toBeGreaterThan(29);
    expect(m.e1rm_bench).toBe(120);
    expect(m.e1rm_squat).toBe(208.5);
    expect(m.e1rm_total).toBe((m.e1rm_squat ?? 0) + 120 + (m.e1rm_deadlift ?? 0));
    expect(askedIds(m)).not.toContain('e1rm_total');
    const t = filled({ ...m, plec: 'M', wzrost_cm: 180, masa_kg: 86, kroki_dziennie: 8000, praca: 'siedzaca', dni_w_tygodniu: 4 });
    expect(t.tdee_szacowane).toBeGreaterThan(2400);
    expect(t.tdee_szacowane).toBeLessThan(3200);
  });

  it('optional field skipped with Enter counts as answered; null does not', () => {
    const f = fieldOf('bodyfat_pct');
    expect(isFieldComplete(f, filled({}), ctx)).toBe(false);
    const res = evaluateField(f, '', filled({}), ctx);
    expect(res).toEqual({ ok: true, value: '' });
    expect(isFieldComplete(f, applyField(f, '', filled({})), ctx)).toBe(true);
  });

  it('number selects store numbers but show labels', () => {
    const f = fieldOf('dni_w_tygodniu');
    expect(fieldPrefill(f, filled({}), ctx).value).toBe('4 dni');
    const m = applyField(f, '5', filled({}));
    expect(m.dni_w_tygodniu).toBe(5);
    expect(fieldPrefill(f, m, ctx).value).toBe('5 dni');
  });

  it('fake presets produce a complete, consistent profile', () => {
    for (const key of ['pl', 'pb']) {
      const m = applyComputed(flow, FAKE_PRESETS[key].fill(emptyAthlete()));
      expect(totalProgress(flow, m, ctx)).toBe(100);
      expect(Object.values(groupProgress(flow, m, ctx)).every((p) => p === 100)).toBe(true);
      expect(firstOpenPosition(flow, m, ctx)).toBeUndefined();
      expect(profileIssues(m)).toEqual([]);
    }
  });

  it('profile rules flag contradictions', () => {
    const issues = profileIssues(filled({ faza: 'redukcja', masa_kg: 80, docelowa_masa_kg: 85, dni_w_tygodniu: 4, preferowane_dni: ['pn', 'sr'], zgoda_lekarska: false }));
    expect(issues.map((i) => i.fieldId)).toEqual(['docelowa_masa_kg', 'preferowane_dni', 'zgoda_lekarska']);
  });
});
