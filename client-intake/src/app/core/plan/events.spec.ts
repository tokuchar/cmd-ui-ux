import { assessEvents, churnWarnings, PlanEvent, RegenMark } from './events';

const DAY = 864e5;
const NOW = Date.parse('2026-11-20T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const ev = (type: PlanEvent['type'], severity: 1 | 2 | 3, daysAgo: number): PlanEvent => ({ id: `${type}${daysAgo}`, at: ago(daysAgo), week: 3, type, severity, note: '' });

describe('assessEvents', () => {
  it('weight × severity × freshness (half-life 7 days)', () => {
    const a = assessEvents([ev('choroba', 2, 0), ev('choroba', 2, 7)], [], NOW);
    expect(a.items.map((i) => i.points)).toEqual([8, 4]); // 4×2×1, 4×2×0,5
    expect(a.score).toBe(12);
    expect(a.verdict).toBe('regen');
  });

  it('continuity: same type 3+ days in a row ×1.5', () => {
    const a = assessEvents([ev('sen', 1, 0), ev('sen', 1, 1), ev('sen', 1, 2)], [], NOW);
    expect(a.items.every((i) => i.continuity)).toBe(true);
    expect(assessEvents([ev('sen', 1, 0), ev('sen', 1, 2)], [], NOW).items.some((i) => i.continuity)).toBe(false);
  });

  it('only events after the last regeneration count; thresholds watch/regen', () => {
    const regen: RegenMark = { at: ago(3), week: 2, kind: 'patch', label: 'Korekta AI', score: 11 };
    const a = assessEvents([ev('kontuzja', 3, 5), ev('stres', 2, 1)], [regen], NOW);
    expect(a.items.length).toBe(1);
    expect(a.verdict).toBe('ok');
    expect(assessEvents([ev('kontuzja', 2, 1)], [], NOW).verdict).toBe('watch');
  });

  it('warns about too frequent regenerations', () => {
    const r = (d: number): RegenMark => ({ at: ago(d), week: 1, kind: 'patch', label: '', score: 0 });
    expect(churnWarnings([r(20)], NOW)).toEqual([]);
    expect(churnWarnings([r(5)], NOW)[0]).toContain('5 dni temu');
    expect(churnWarnings([r(20), r(10)], NOW).length).toBe(2);
  });
});
