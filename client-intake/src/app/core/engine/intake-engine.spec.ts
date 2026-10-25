import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of } from 'rxjs';
import {
  AddressResolveDto,
  CardValidationDto,
  ClientCardDto,
  ClientLookupDto,
  DictionaryDto,
  EntityClassificationDto,
  PreliminaryClientDto,
  ReferralCandidateDto,
  SavePreliminaryResponseDto,
} from '../api/api.models';
import { CLIENT_API, ClientApi } from '../api/client-api';
import { MockClientApi } from '../api/mock-client-api';
import { APP_CONFIG, buildAppConfig } from '../config/app-config';
import { dodatkoweIssues } from '../config/steps/dodatkowe.steps';
import { emptyCustomer } from '../models/customer.model';
import { IntakeEngine } from './intake-engine';

/** Synchroniczny stub usługi (of() bez opóźnień) — deterministyczne testy efektów. */
class StubApi implements ClientApi {
  getDictionaries(): Observable<DictionaryDto[]> {
    return of([]);
  }
  savePreliminary(_dto: PreliminaryClientDto, clientId: string | null): Observable<SavePreliminaryResponseDto> {
    return of({ clientId: clientId ?? 'KL-1', created: !clientId });
  }
  searchReferrals(): Observable<ReferralCandidateDto[]> {
    return of([]);
  }
  validateCard(_dto: ClientCardDto): Observable<CardValidationDto> {
    return of({ valid: true, issues: [] });
  }
  lookupClient(): Observable<ClientLookupDto> {
    return of({ firstName: 'Anna', lastName: 'Testowa', identifier: '5213001000' });
  }
  classifyEntity(identifier: string): Observable<EntityClassificationDto> {
    const digits = identifier.replace(/\D/g, '');
    if (!digits) {
      return of({ entityType: '', issues: [{ path: null, code: 'ID_EMPTY', message: 'Podaj identyfikator.', severity: 'error' }] });
    }
    return of({ entityType: digits.length === 10 ? 'JDG' : 'OSOBA_FIZYCZNA' });
  }
  resolveAddress(postalCode: string): Observable<AddressResolveDto> {
    const city = postalCode === '32-552' ? 'Płaza' : null;
    return of({ postalCode, city, issues: city ? [] : [{ path: null, code: 'POSTAL_UNKNOWN', message: 'Nieznany kod.', severity: 'warning' }] });
  }
}

describe('IntakeEngine — efekty async (prefill / onCommit / sekcje)', () => {
  let engine: IntakeEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: buildAppConfig({ demoFields: true }) },
        { provide: CLIENT_API, useClass: StubApi },
      ],
    });
    engine = TestBed.inject(IntakeEngine);
  });

  it('prefill: wypełnia model danymi z usługi na starcie', () => {
    engine.start();
    const m = engine.s.model();
    expect([m.imie, m.nazwisko, m.identyfikator]).toEqual(['Anna', 'Testowa', '5213001000']);
  });

  it('onCommit: ustala typ podmiotu po zatwierdzeniu identyfikatora', () => {
    engine.editField('identyfikator');
    engine.s.draft.set('5213001000');
    engine.submit();
    expect(engine.s.model().typPodmiotu).toBe('JDG');
    expect(engine.s.issues().some((i) => i.fieldId === 'identyfikator')).toBe(false);
  });

  it('onCommit: podpowiada miejscowość z kodu pocztowego (patch modelu)', () => {
    engine.editField('kod_pocztowy');
    engine.s.draft.set('32-552');
    engine.submit();
    expect(engine.s.model().miejscowosc).toBe('Płaza');
  });

  it('onCommit: błąd biznesowy przypięty do pola zatrzymuje operatora na tym polu', () => {
    engine.editField('identyfikator');
    engine.s.draft.set('');
    engine.submit();
    expect(engine.s.issues().some((i) => i.fieldId === 'identyfikator')).toBe(true);
    expect(engine.s.model().typPodmiotu).toBe('');
  });

  it('błąd przypięty do sekcji trafia do sheet().issue, nie do pól ani do uwag ogólnych', () => {
    engine.s.issues.set([{ fieldId: 'dodatkowe', message: 'Podmiot JDG musi mieć główne PKD.' }]);
    const demo = engine.sheet().find((g) => g.id === 'dodatkowe');
    expect(demo?.issue).toContain('PKD');
    expect(engine.sectionIssues().get('dodatkowe')?.length).toBe(1);
    expect(engine.issueMap().has('dodatkowe')).toBe(false);
    expect(engine.generalIssues().length).toBe(0);
  });
});

describe('dodatkoweIssues — reguły biznesowe z usługi', () => {
  it('niepełnoletni → błąd przypięty do pola daty urodzenia', () => {
    const minor = { ...emptyCustomer(), data_urodzenia: '2015-01-01' };
    const issue = dodatkoweIssues(minor).find((i) => i.code === 'MINOR_NEEDS_ID');
    expect(issue?.fieldId).toBe('data_urodzenia');
  });

  it('JDG → błąd przypięty do sekcji (fieldId = id grupy)', () => {
    const jdg = { ...emptyCustomer(), typPodmiotu: 'JDG' };
    const issue = dodatkoweIssues(jdg).find((i) => i.code === 'PKD_REQUIRED');
    expect(issue?.fieldId).toBe('dodatkowe');
  });

  it('pełnoletnia osoba fizyczna → brak błędów', () => {
    const ok = { ...emptyCustomer(), data_urodzenia: '1990-01-01', typPodmiotu: 'OSOBA_FIZYCZNA' };
    expect(dodatkoweIssues(ok)).toEqual([]);
  });
});

describe('MockClientApi — nowe punkty integracji', () => {
  const api = new MockClientApi();

  it('classifyEntity: 10-cyfrowy NIP → JDG', async () => {
    const res = await firstValueFrom(api.classifyEntity('521-300-10-00'));
    expect(res.entityType).toBe('JDG');
  });

  it('resolveAddress: znany kod → miejscowość, nieznany → ostrzeżenie', async () => {
    const known = await firstValueFrom(api.resolveAddress('32-552'));
    const unknown = await firstValueFrom(api.resolveAddress('99-999'));
    expect(known.city).toBe('Płaza');
    expect(unknown.city).toBeNull();
    expect(unknown.issues?.[0]?.code).toBe('POSTAL_UNKNOWN');
  });
});
