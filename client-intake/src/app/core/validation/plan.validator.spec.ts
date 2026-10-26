import { buildFlow } from '../config/flow.config';
import { FAKE_PRESETS } from '../config/fake-data.config';
import { applyComputed } from '../engine/field-runtime';
import { emptyAthlete } from '../models/athlete.model';
import { buildDemoPlan } from '../plan/demo-plan';
import { applyPatch, extractJson, parsePlanImport } from './plan.validator';

const profile = applyComputed(buildFlow(), FAKE_PRESETS['pl'].fill(emptyAthlete()));
const plan = buildDemoPlan(profile, '2026-11-02');

describe('plan validator', () => {
  it('accepts the demo plan (same shape as docs/samples/plan.example.json)', () => {
    const res = parsePlanImport(JSON.stringify(plan));
    expect(res.kind).toBe('plan');
    expect(res.issues).toEqual([]);
  });

  it('strips markdown fences and chatter around the JSON', () => {
    expect(extractJson('Oto plan:\n```json\n{"a":1}\n```\nPowodzenia!')).toBe('{"a":1}');
    expect(parsePlanImport('Plan: ' + JSON.stringify(plan) + ' koniec').kind).toBe('plan');
  });

  it('reports errors with paths', () => {
    const broken = structuredClone(plan) as any;
    broken.macrocycles[0].mesocycles[1].focus = 'peaking';
    broken.macrocycles[0].mesocycles[0].microcycles[0].sessions[0].day = 'monday';
    broken.macrocycles[0].mesocycles[0].microcycles[0].sessions[0].main[0].rir = 12;
    broken.macrocycles[0].mesocycles[0].microcycles[0].sessions[0].main[1].load = { method: 'formula', expr: 'e1rm * 0.8 + foo' };
    const res = parsePlanImport(JSON.stringify(broken));
    expect(res.kind).toBe('invalid');
    const paths = res.issues.map((i) => i.path);
    expect(paths).toContain('macrocycles[0].mesocycles[1].focus');
    expect(paths).toContain('macrocycles[0].mesocycles[0].microcycles[0].sessions[0].day');
    expect(paths).toContain('macrocycles[0].mesocycles[0].microcycles[0].sessions[0].main[0].rir');
    expect(paths).toContain('macrocycles[0].mesocycles[0].microcycles[0].sessions[0].main[1].load.expr');
  });

  it('warns about missing weeks and duplicates are errors', () => {
    const gap = structuredClone(plan);
    gap.macrocycles[0].mesocycles[0].microcycles.splice(1, 1);
    const res = parsePlanImport(JSON.stringify(gap));
    expect(res.kind).toBe('plan');
    expect(res.issues.some((i) => i.severity === 'warning' && i.message.includes('Brak tygodni 2–2'))).toBe(true);
    const dup = structuredClone(plan);
    dup.macrocycles[0].mesocycles[0].microcycles[1].week = 1;
    expect(parsePlanImport(JSON.stringify(dup)).kind).toBe('invalid');
  });

  it('invalid JSON is reported, patch of microcycles is recognized and applied by week', () => {
    expect(parsePlanImport('{ nope').kind).toBe('invalid');
    const week3 = { ...plan.macrocycles[0].mesocycles[0].microcycles[2], label: 'korekta' };
    const res = parsePlanImport(JSON.stringify({ microcycles: [week3] }));
    expect(res.kind).toBe('patch');
    const patched = applyPatch(plan, [week3]);
    expect(patched.macrocycles[0].mesocycles[0].microcycles[2].label).toBe('korekta');
    expect(patched.macrocycles[0].mesocycles[0].microcycles[1].label).toBe(plan.macrocycles[0].mesocycles[0].microcycles[1].label);
  });

  it('upgrades the legacy {type: rpe} load to RTS + RIR', () => {
    const legacy = structuredClone(plan) as any;
    const ex = legacy.macrocycles[0].mesocycles[0].microcycles[0].sessions[1].main[0];
    delete ex.rir;
    ex.load = { type: 'rpe', value: 8 };
    const res = parsePlanImport(JSON.stringify(legacy));
    expect(res.kind).toBe('plan');
    const up = (res as any).plan.macrocycles[0].mesocycles[0].microcycles[0].sessions[1].main[0];
    expect(up.load).toEqual({ method: 'rts' });
    expect(up.rir).toBe(2);
  });

  it('warns when an exercise loads an injured area and the AI made no decision', () => {
    const shoulder = { id: 'b', nazwa: 'bark P', obszar: 'bark', strona: 'P', bol: 6, od_kiedy: '2-6', diagnoza: 'naderwany nadgrzebieniowy', fizjo: true, ruchy_bolesne: [] };
    const clean = buildDemoPlan(applyComputed(buildFlow(), FAKE_PRESETS['pb'].fill(emptyAthlete())), '2026-11-02');
    const res = parsePlanImport(JSON.stringify(clean), { injuries: [shoulder] });
    expect(res.issues.some((i) => i.severity === 'warning' && i.message.includes('Brak decyzji dla kontuzji „bark P" (poważna)'))).toBe(true);
    // Plan zbudowany z kontuzją w profilu ma decyzje (injuryNote) → brak ostrzeżeń.
    const withInjury = buildDemoPlan(applyComputed(buildFlow(), { ...FAKE_PRESETS['pb'].fill(emptyAthlete()), kontuzje: [shoulder] }), '2026-11-02');
    const ok = parsePlanImport(JSON.stringify(withInjury), { injuries: [shoulder] });
    expect(ok.issues.filter((i) => i.message.includes('Brak decyzji'))).toEqual([]);
    const benches = withInjury.macrocycles[0].mesocycles[0].microcycles[0].sessions.flatMap((s) => s.main).filter((b) => b.lift === 'bench');
    expect(benches).toEqual([]); // poważna kontuzja barku: wyciskanie zamienione na rehab
  });

  it('nutrition extras: caffeine limits, health-sensitive caffeine, tip categories, patch with nutrition', () => {
    const p = structuredClone(plan);
    p.nutrition.caffeine = { preWorkoutMg: 500, minutesBefore: 30, dailyMaxMg: 450, cutoffHoursBeforeSleep: 8 };
    (p.nutrition.tips as any).push({ category: 'magia', title: 'x', text: 'y' });
    const res = parsePlanImport(JSON.stringify(p), { health: 'nadciśnienie' });
    const msgs = res.issues.map((i) => i.path + ' ' + i.message).join('\n');
    expect(res.kind).toBe('plan');
    expect(msgs).toContain('powyżej 400 mg');
    expect(msgs).toContain('większa niż limit dzienny');
    expect(msgs).toContain('nadciśnienie');
    expect(msgs).toContain('nutrition.tips[' );

    const patch = parsePlanImport(JSON.stringify({ nutrition: { tips: [{ category: 'zdrowie', title: 'Sen', text: 'Kolacja wcześniej' }] } }));
    expect(patch.kind).toBe('patch');
    expect((patch as any).microcycles).toEqual([]);
    expect((patch as any).nutrition.tips.length).toBe(1);
  });

  it('demo plan: caffeine from profile (evening training, risky condition) and tips', () => {
    const base = FAKE_PRESETS['pl'].fill(emptyAthlete());
    const evening = buildDemoPlan(applyComputed(buildFlow(), { ...base, pora_treningu: 'wieczor', choroby_leki: 'nadciśnienie' }), '2026-11-02');
    expect(evening.nutrition.caffeine!.dailyMaxMg).toBe(200);
    expect(evening.nutrition.caffeine!.preWorkoutMg).toBeLessThanOrEqual(Math.round((86 * 1.5) / 25) * 25);
    expect(evening.nutrition.caffeine!.skipWhen!.join(' ')).toContain('nadciśnienie');
    expect(evening.nutrition.tips!.some((t) => t.category === 'faza' && t.title.startsWith('Redukcja'))).toBe(true);
    expect(parsePlanImport(JSON.stringify(evening), { health: 'nadciśnienie' }).issues.filter((i) => i.path.startsWith('nutrition'))).toEqual([]);
  });
});
