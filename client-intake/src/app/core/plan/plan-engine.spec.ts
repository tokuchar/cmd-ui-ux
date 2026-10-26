import { TestBed } from '@angular/core/testing';
import { CLIENT_API } from '../api/client-api';
import { MockClientApi } from '../api/mock-client-api';
import { APP_CONFIG, buildAppConfig } from '../config/app-config';
import { IntakeEngine } from '../engine/intake-engine';
import { layoutPlan, weekDate } from './graph-layout';
import { matchCommand, PlanEngine } from './plan-engine';

describe('PlanEngine — komendy planu', () => {
  let plan: PlanEngine;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: buildAppConfig() },
        { provide: CLIENT_API, useClass: MockClientApi },
      ],
    });
    TestBed.inject(IntakeEngine).runCommand('fake pl');
    plan = TestBed.inject(PlanEngine);
    plan.run('demo');
  });

  it('matches the longest command and keeps original args', () => {
    expect(matchCommand('prompt korekta').cmd?.cmd).toBe('prompt korekta');
    expect(matchCommand('Sugeruj ciężary przysiad')).toMatchObject({ cmd: { cmd: 'sugeruj ciezary' }, args: 'przysiad' });
    expect(matchCommand('zamień przysiad na front squat').args).toBe('przysiad na front squat');
    expect(matchCommand('xyz').cmd).toBeNull();
  });

  it('nastepny opens the first unfinished session; zrobione moves on', () => {
    plan.run('nastepny');
    const first = plan.store.openSession();
    expect(first).toMatch(/^w1-pn-0$/);
    plan.run('zrobione');
    expect(plan.store.state().status[first!]).toBe('done');
    expect(plan.nextSession()?.key).toBe('w1-wt-1');
  });

  it('sugeruj ciezary computes kg from profile e1RM; zaloguj overrides it', () => {
    plan.run('nastepny');
    const squat = plan.loads().find((r) => r.basis.startsWith('e1RM squat'))!;
    expect(squat.kg).toBeGreaterThan(100);
    expect(squat.kg! % 1.25).toBe(0); // fake pl ma mikrotalerze
    plan.run('zaloguj przysiad 200x3@8');
    expect(plan.maxFor('squat')).toBe(231.5);
    expect(plan.loads().find((r) => r.basis.startsWith('e1RM squat'))!.kg).toBeGreaterThan(squat.kg!);
  });

  it('krocej cuts low-priority accessories; zamien and przesun edit the session locally', () => {
    plan.run('nastepny');
    const key = plan.store.openSession()!;
    const before = plan.sessionByKey(key)!.session;
    plan.run('krocej 45');
    const after = plan.sessionByKey(key)!.session;
    expect(after.accessories.length).toBeLessThan(before.accessories.length);
    expect(after.main).toEqual(before.main);
    plan.run('zamien hip thrust na glute bridge');
    expect(JSON.stringify(plan.sessionByKey(key)!.session)).not.toContain('Hip thrust');
    plan.run('przesun pn sr');
    expect(plan.sessionByKey(key)!.session.day).toBe('sr');
  });

  it('modyfikuj edits sets/reps/load by number until "gotowe"', () => {
    plan.run('nastepny');
    plan.run('modyfikuj');
    expect(plan.mode()).toBe('modify');
    plan.run('1 3x2 rir1 31X1');
    const s = plan.activeSession()!.session;
    expect(s.main[0]).toMatchObject({ sets: 3, reps: '2', rir: 1, tempo: '31X1' });
    expect(plan.loads()[0].set).toMatch(/^3 × 2 · [\d.]+ kg · 31X1 · RIR 1$/);
    plan.run('2 %70');
    expect(plan.activeSession()!.session.main[1].load).toMatchObject({ method: 'pct', value: 70 });
    plan.run('gotowe');
    expect(plan.mode()).toBe('command');
  });

  it('info commands switch the detail panel; unknown commands fail', () => {
    plan.run('dieta');
    expect(plan.panel()).toBe('diet');
    plan.run('deload');
    const firstDeload = plan.store.weeks().find((w) => w.micro.isDeload)!.micro.week;
    expect(plan.store.current()).toBe(firstDeload);
    plan.run('mezo intens');
    expect(plan.store.highlight()).toBe('m2');
    plan.run('cos dziwnego');
    expect(plan.echo().type).toBe('error');
  });

  it('graph layout: main lane, a branch per mesocycle, deload/taper nodes and a start tag', () => {
    const g = layoutPlan(plan.store.plan()!, plan.store.weeks(), {});
    expect(g.nodes.length).toBe(plan.store.weeks().length);
    const deloads = plan.store.weeks().filter((w) => w.micro.isDeload).map((w) => w.micro.week);
    expect(deloads.length).toBe(2);
    expect(g.nodes.filter((n) => n.kind === 'deload').map((n) => n.week)).toEqual(deloads);
    expect(g.nodes.some((n) => n.kind === 'taper')).toBe(true);
    expect(new Set(g.nodes.map((n) => n.lane)).size).toBe(3);
    expect(g.lanes.some((l) => l.kind === 'goal')).toBe(true);
    expect(g.tag?.label).toBe('START');
    expect(g.weeks[0].date).toBe(weekDate(plan.store.plan()!.meta.startDate, 1));
    expect(g.mesoLabels.length).toBe(new Set(plan.store.weeks().map((w) => w.meso.id)).size);
    expect(g.lanes.filter((l) => l.kind === 'meso').every((l) => !l.label.includes('hipertrofia'))).toBe(true);
  });

  it('sugeruj ciezary bench: no table for a torn supraspinatus, RIR table otherwise', () => {
    plan.run('sugeruj ciezary bench');
    expect(plan.echo().html).toContain('RIR 2');
    expect(plan.echo().html).toContain('talerze 1.25 kg');
    TestBed.inject(IntakeEngine).s.model.update((m) => ({
      ...m,
      kontuzje: [{ id: 'b', nazwa: 'bark', obszar: 'bark', strona: 'P', bol: 5, od_kiedy: '2-6', diagnoza: 'naderwany nadgrzebieniowy', fizjo: true, ruchy_bolesne: [] }],
    }));
    plan.run('sugeruj ciezary bench');
    expect(plan.echo().type).toBe('warning');
    expect(plan.echo().html).not.toContain('RIR 2 ');
    expect(plan.echo().html).toContain('Nie podaję ciężarów');
  });

  it('zglos / sen / waga log events; stan shows the verdict; correction adds a ↻ mark', () => {
    plan.run('zglos choroba 3 grypa');
    expect(plan.store.events().at(-1)).toMatchObject({ type: 'choroba', severity: 3, note: 'grypa' });
    expect(plan.assessment().verdict).toBe('regen'); // 4 × 3 = 12
    plan.run('sen 5 4');
    expect(plan.store.events().at(-1)).toMatchObject({ type: 'sen', auto: true });
    expect(plan.store.daily().at(-1)!.sen).toEqual({ h: 5, q: 4 });
    plan.run('makro 2500 170 260 70');
    expect(plan.stats().makro!.kcal).toBe(2500);
    plan.run('cardio 40 z2 140');
    expect(plan.store.daily().at(-1)!.cardio![0]).toEqual({ minutes: 40, zone: 'Z2', hr: 140 });
    plan.run('stan');
    expect(plan.panel()).toBe('events');

    const week3 = plan.store.weeks()[2].micro;
    plan.importText(JSON.stringify({ microcycles: [week3] }), true);
    expect(plan.store.regens()).toMatchObject([{ kind: 'patch', week: 3 }]);
    expect(plan.assessment().score).toBe(0); // zdarzenia rozliczone przez przegenerowanie
    plan.importText(JSON.stringify({ microcycles: [week3] }), true);
    expect(plan.echo().type).toBe('warning'); // drugie przegenerowanie tego samego dnia
    expect(plan.echo().html).toContain('0 dni temu');
  });

  it('makro without numbers still opens the macrocycle', () => {
    plan.run('makro');
    expect(plan.panel()).toBe('macro');
  });

  it('kofeina and porady show the nutrition strategy; session drawer data has fueling', () => {
    plan.run('kofeina');
    expect(plan.panel()).toBe('diet');
    expect(plan.echo().html).toMatch(/Przed treningiem <strong>\d+ mg<\/strong>/);
    plan.run('porady zdrowie');
    expect(plan.panel()).toBe('tips');
    expect(plan.tipFilter()).toBe('zdrowie');
    expect(plan.store.plan()!.nutrition.periWorkout!.post).toContain('białka');
  });
});

describe('weekDate', () => {
  it('formats the Monday of a week as dd.MM in UTC', () => {
    expect(weekDate('2026-11-02', 1)).toBe('02.11');
    expect(weekDate('2026-11-02', 4)).toBe('23.11');
    expect(weekDate('2026-12-28', 2)).toBe('04.01');
    expect(weekDate('bad', 1)).toBe('');
  });
});
