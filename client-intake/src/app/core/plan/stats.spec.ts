import { hrZones } from '../domain/calc';
import { buildStats, DailyLog, statsText } from './stats';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const day = (d: number) => new Date(NOW - d * 864e5).toISOString().slice(0, 10);

describe('stats', () => {
  it('weight trend by linear regression vs planned cut; macro and sleep averages', () => {
    const daily: DailyLog[] = [0, 2, 4, 6, 8, 10].map((d, i) => ({ date: day(d), waga: 86 - (5 - i) * 0.1, makro: { kcal: 2400, protein: 170, carbs: 250, fat: 70 }, sen: { h: 6.5, q: 6 } }));
    const s = buildStats({ daily, weeks: [], head: 1, status: {}, log: [], bodyKg: 86, tempoPct: 0.5, faza: 'redukcja', now: NOW });
    expect(s.waga!.trendKgPerWeek).toBeCloseTo(-0.35, 1); // −0,1 kg co 2 dni
    expect(s.waga!.plannedKgPerWeek).toBe(-0.43);
    expect(s.makro!.kcal).toBe(2400);
    expect(s.sen!.avgH).toBe(6.5);
    expect(statsText(s, []).join(' ')).toContain('trend -0.35 kg/tydz.');
  });

  it('HR zones: Karvonen with resting HR, % HRmax without, Tanaka fallback', () => {
    const k = hrZones({ wiek: 30, tetno_max: 190, tetno_spoczynkowe: 60 });
    expect(k.find((z) => z.zone === 'Z2')).toMatchObject({ min: 138, max: 151 });
    const t = hrZones({ wiek: 30, tetno_max: '', tetno_spoczynkowe: '' });
    expect(t[4].max).toBe(187); // 208 − 0,7 × 30
    expect(hrZones({ wiek: null, tetno_max: null, tetno_spoczynkowe: null })).toEqual([]);
  });
});
