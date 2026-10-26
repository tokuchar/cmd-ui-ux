import { ExerciseBlock } from '../models/plan.model';
import { evalFormula } from './formula';
import { formatSet, resolveLoad } from './loads';

const block = (b: Partial<ExerciseBlock>): ExerciseBlock => ({ exercise: 'Wyciskanie', lift: 'bench', sets: 4, reps: 5, rir: 2, tempo: '20X1', load: { method: 'rts' }, ...b });

describe('formula', () => {
  it('evaluates arithmetic with variables, min/max and precedence', () => {
    expect(evalFormula('min(e1rm * 0.5, 60)', { e1rm: 140, reps: 5, rir: 2 })).toEqual({ ok: true, value: 60 });
    expect(evalFormula('(e1rm - 20) * 0.5 + max(reps, rir)', { e1rm: 100, reps: 5, rir: 2 })).toEqual({ ok: true, value: 45 });
    expect(evalFormula('-e1rm / 2', { e1rm: 100, reps: 5, rir: 2 })).toEqual({ ok: true, value: -50 });
  });

  it('rejects anything that is not the allowed grammar (no eval)', () => {
    expect(evalFormula('alert(1)', { e1rm: 1, reps: 1, rir: 1 }).ok).toBe(false);
    expect(evalFormula('e1rm; 1', { e1rm: 1, reps: 1, rir: 1 }).ok).toBe(false);
    expect(evalFormula('e1rm *', { e1rm: 1, reps: 1, rir: 1 }).ok).toBe(false);
  });
});

describe('resolveLoad', () => {
  it('rts: e1RM × RTS table, rounded to plates', () => {
    expect(resolveLoad(block({}), 140, 2.5).kg).toBe(112.5); // 5+2 → 81.1%
    expect(resolveLoad(block({}), 140, 1.25).kg).toBe(113.75);
  });

  it('AI corrections: adjustPct then maxKg cap', () => {
    const r = resolveLoad(block({ load: { method: 'rts', adjustPct: -25, maxKg: 80 } }), 140, 1.25);
    expect(r.kg).toBe(80);
    expect(r.capped).toBe(true);
    expect(resolveLoad(block({ load: { method: 'pct', value: 70, adjustPct: -10 } }), 140, 1.25).kg).toBe(88.75);
  });

  it('formula, kg and RIR derived from the table when the plan gives none', () => {
    expect(resolveLoad(block({ load: { method: 'formula', expr: 'min(e1rm * 0.5, 60)' } }), 140, 2.5).kg).toBe(60);
    const kg = resolveLoad(block({ rir: undefined, load: { method: 'kg', value: 100 } }), 140, 2.5);
    expect(kg.kg).toBe(100);
    expect(kg.rir).toBe(5.5); // 100/140 = 71,4% ≈ 5 powt. + 5,5 RIR
    expect(resolveLoad(block({ load: { method: 'kg' } }), null, 2.5).kg).toBeNull();
    expect(resolveLoad(block({ load: { method: 'formula', expr: 'e1rm *' } }), 140, 2.5).warning).toContain('błąd wzoru');
  });

  it('formats a set as weight · reps · tempo · RIR', () => {
    const b = block({});
    expect(formatSet(b, resolveLoad(b, 140, 2.5))).toBe('4 × 5 · 112.5 kg · 20X1 · RIR 2');
  });
});
