import { emptyCustomer } from '../models/customer.model';
import { toClientCardDto, toPreliminaryDto } from './customer.mapper';
import { fromDictionaryDtos } from './dictionary.mapper';
import { fromReferralCandidateDto } from './person.mapper';
import { mapIssuePath, mapValidationIssues } from './validation-error.mapper';

describe('mappers', () => {
  const customer = {
    ...emptyCustomer(),
    imie: 'Jan',
    nazwisko: 'Kowalski',
    telefon: '601234567',
    email: 'jan@firma.pl',
    adres_klienta: 'ul. Długa 5, Warszawa, 00-123',
    wysylka_same: true,
    polecajacy: [{ id: 'P-1', imie: 'Ewa Dąbrowska', telefon: '512223344', znam: 'RODZINA' }],
  };

  it('model → preliminary DTO (phone in E.164)', () => {
    expect(toPreliminaryDto(customer)).toEqual({
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '+48601234567',
      email: 'jan@firma.pl',
    });
  });

  it('model → card DTO (same shipping address, referrals)', () => {
    const dto = toClientCardDto(customer, 'KL-1');
    expect(dto.clientId).toBe('KL-1');
    expect(dto.shipping).toEqual({ sameAsClient: true, address: 'ul. Długa 5, Warszawa, 00-123' });
    expect(dto.referrals).toEqual([{ personId: 'P-1', fullName: 'Ewa Dąbrowska', relation: 'RODZINA', phone: '+48512223344' }]);
    expect(dto.client.birthDate).toBeUndefined();
  });

  it('referral search DTO → person with extra data', () => {
    expect(fromReferralCandidateDto({ personId: 'P-9', fullName: 'Ola', phone: '+48 601 112 233', city: 'Kraków' })).toEqual({
      id: 'P-9',
      imie: 'Ola',
      telefon: '601112233',
      znam: '',
      miasto: 'Kraków',
      ostatniKontakt: undefined,
    });
  });

  it('dictionaries are sorted by weight (most probable first)', () => {
    const d = fromDictionaryDtos([{ code: 'r', entries: [{ code: 'B', label: 'b', weight: 1 }, { code: 'A', label: 'a', weight: 9 }] }]);
    expect(d['r'].map((e) => e.value)).toEqual(['A', 'B']);
  });

  it('validation paths map to field ids, keeping list indexes', () => {
    expect(mapIssuePath('client.email')).toBe('email');
    expect(mapIssuePath('referrals[2].phone')).toBe('polecajacy[2].telefon');
    expect(mapIssuePath('unknown.path')).toBeNull();
    expect(mapIssuePath(null)).toBeNull();
  });

  it('dedupes issues that map to the same field and message', () => {
    const issues = mapValidationIssues({
      valid: false,
      issues: [
        { path: 'client.firstName', code: 'X', message: 'Imię i nazwisko niezgodne z PESEL', severity: 'error' },
        { path: 'client.lastName', code: 'X', message: 'Imię i nazwisko niezgodne z PESEL', severity: 'error' },
        { path: null, code: 'G', message: 'Ogólny', severity: 'error' },
      ],
    });
    expect(issues).toEqual([
      { fieldId: 'imie', message: 'Imię i nazwisko niezgodne z PESEL', code: 'X' },
      { fieldId: null, message: 'Ogólny', code: 'G' },
    ]);
  });
});
