import { TestBed } from '@angular/core/testing';
import { CLIENT_API } from '../api/client-api';
import { MockClientApi } from '../api/mock-client-api';
import { APP_CONFIG, buildAppConfig } from '../config/app-config';
import { IntakeEngine } from './intake-engine';

describe('IntakeEngine — sport intake', () => {
  let engine: IntakeEngine;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: buildAppConfig() },
        { provide: CLIENT_API, useClass: MockClientApi },
      ],
    });
    engine = TestBed.inject(IntakeEngine);
  });

  const answer = (text: string) => {
    engine.s.draft.set(text);
    engine.submit();
  };

  it('starts at the first question and walks the profile step', () => {
    engine.start();
    expect(engine.prompt().label).toBe('Imię');
    answer('kuba');
    expect(engine.s.model().imie).toBe('Kuba');
    expect(engine.prompt().label).toBe('Płeć');
  });

  it('collection from a comma list: goals → per-goal questions; "brak" finishes with an empty list', () => {
    engine.editField('cele_dodatkowe');
    answer('półmaraton, stanie na rękach');
    expect(engine.prompt().showApprove).toBe(true);
    answer('półmaraton, stanie na rękach'); // ten sam wpis = zatwierdź wszystkie
    expect(engine.prompt().counter).toContain('Cel 1/2');
    expect(engine.s.draft()).toBe('Bieg / wytrzymałość');

    engine.editField('kontuzje');
    answer('brak');
    expect(engine.s.model().kontuzje).toEqual([]);
  });

  it('resumes a stored profile at the first unanswered question', () => {
    engine.runCommand('fake pl');
    engine.s.model.update((m) => ({ ...m, sen_godz: null }));
    engine.start();
    expect(engine.prompt().label).toBe('Sen (godz. / noc)');
  });

  it('autosaves the profile to localStorage', () => {
    engine.runCommand('fake pb');
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('athlete-profile-v1')!).imie).toBe('Ola');
  });
});
