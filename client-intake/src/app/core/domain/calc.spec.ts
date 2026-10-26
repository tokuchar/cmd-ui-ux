import { e1rm, estimateTdee, pctForRir, pctOf1RM, rirForPct, suggestLoad } from './calc';

describe('calc', () => {
  it('pctOf1RM follows the RTS table (with half-step interpolation)', () => {
    expect(pctOf1RM(1, 10)).toBe(1);
    expect(pctOf1RM(5, 10)).toBeCloseTo(0.863, 3);
    expect(pctOf1RM(8, 10)).toBeCloseTo(0.786, 3);
    expect(pctOf1RM(3, 8)).toBeCloseTo(pctOf1RM(5, 10), 5); // 3@8 = 5 powt. efektywnych
    expect(pctForRir(1, 0.25)).toBeCloseTo(0.989, 3);
    expect(pctForRir(12, 6)).toBeLessThan(pctForRir(12, 4));
  });

  it('rirForPct inverts the table; null when the weight is above max for those reps', () => {
    expect(rirForPct(5, 0.811)).toBe(2);
    expect(rirForPct(5, 0.95)).toBeNull();
  });

  it('e1rm and suggestLoad are inverse (rounded to plates)', () => {
    const max = e1rm({ kg: 180, reps: 3, rpe: 8 })!;
    expect(max).toBe(208.5);
    expect(suggestLoad(max, { reps: 3, rir: 2 })).toBe(180);
    expect(suggestLoad(max, { reps: 3, rir: 2 }, 1.25)).toBe(180);
    expect(suggestLoad(200, { reps: 1, pct: 90 })).toBe(180);
    expect(suggestLoad(123, { reps: 1, rir: 1 }, 1.25)).toBe(117.5); // 2 powt. efektywne = 95,5%
  });

  it('estimateTdee needs body data', () => {
    expect(estimateTdee({ plec: 'M', masa_kg: null, wzrost_cm: 180, wiek: 30, kroki_dziennie: 8000, praca: '', dni_w_tygodniu: 4 })).toBeNull();
    const m = estimateTdee({ plec: 'M', masa_kg: 86, wzrost_cm: 180, wiek: 30, kroki_dziennie: 8000, praca: 'siedzaca', dni_w_tygodniu: 4 })!;
    const k = estimateTdee({ plec: 'K', masa_kg: 86, wzrost_cm: 180, wiek: 30, kroki_dziennie: 8000, praca: 'siedzaca', dni_w_tygodniu: 4 })!;
    expect(m - k).toBeGreaterThan(200);
  });
});
