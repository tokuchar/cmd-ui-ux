import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { randomFrom } from '../engine/text';
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
  ValidationIssueDto,
} from './api.models';
import { ClientApi } from './client-api';

/**
 * Mock backendu analogiczny do API obecnej aplikacji (in-memory, z opóźnieniem sieci).
 * Kody testowe: #1234 → 4 stałe osoby, #0000 → brak osób, inny kod → 3 losowe.
 * Reguły walidacji karty są przykładowe — prawdziwe zwróci backend.
 */
@Injectable()
export class MockClientApi implements ClientApi {
  private seq = 1000;

  getDictionaries(): Observable<DictionaryDto[]> {
    return of(MOCK_DICTIONARIES).pipe(delay(150));
  }

  savePreliminary(dto: PreliminaryClientDto, clientId: string | null): Observable<SavePreliminaryResponseDto> {
    const id = clientId ?? `KL-${++this.seq}`;
    return of({ clientId: id, created: !clientId }).pipe(delay(250));
  }

  searchReferrals(code: string): Observable<ReferralCandidateDto[]> {
    let result: ReferralCandidateDto[];
    if (code === '#1234') result = REFERRAL_TEST;
    else if (code === '#0000') result = [];
    else {
      result = Array.from({ length: 3 }, (_, i) => ({
        personId: `P-${code.slice(1)}-${i + 1}`,
        fullName: randomFrom(RANDOM_NAMES),
        phone: `+48${randomFrom(RANDOM_PHONES)}`,
        city: randomFrom(['Warszawa', 'Kraków', 'Gdańsk', 'Poznań']),
      }));
    }
    return of(result).pipe(delay(300));
  }

  validateCard(dto: ClientCardDto): Observable<CardValidationDto> {
    const issues: ValidationIssueDto[] = [];
    const err = (path: string | null, code: string, message: string) =>
      issues.push({ path, code, message, severity: 'error' });

    if (!dto.clientId) err(null, 'CLIENT_NOT_SAVED', 'Brak wstępnego zapisu klienta — zapisz dane podstawowe.');

    const domain = dto.client.email.split('@')[1] ?? '';
    if (TEST_DOMAINS.includes(domain)) {
      err('client.email', 'EMAIL_TEST_DOMAIN', `Domena „${domain}" jest testowa — podaj prawdziwy adres e-mail klienta.`);
    }

    const zipCity = (path: string, address: string) => {
      const problem = zipCityMismatch(address);
      if (problem) err(path, 'ZIP_CITY_MISMATCH', problem);
    };
    zipCity('client.address', dto.client.address);
    if (!dto.shipping.sameAsClient) zipCity('shipping.address', dto.shipping.address);

    const seen = new Map<string, number>();
    dto.referrals.forEach((r, i) => {
      if (r.phone && r.phone === dto.client.phone) {
        err(`referrals[${i}].phone`, 'REFERRAL_PHONE_IS_CLIENT', 'Numer osoby polecającej jest taki sam jak numer klienta.');
      } else if (seen.has(r.phone)) {
        err(`referrals[${i}].phone`, 'REFERRAL_PHONE_DUPLICATE', `Ten sam numer ma już osoba nr ${seen.get(r.phone)! + 1}.`);
      }
      seen.set(r.phone, i);
    });

    return of({ valid: issues.length === 0, issues }).pipe(delay(450));
  }

  /* --- Nowe punkty integracji (prefill / klasyfikacja / adres) --- */

  lookupClient(): Observable<ClientLookupDto> {
    return of({ firstName: 'Jan', lastName: 'Kowalski', identifier: '5213001000' }).pipe(delay(300));
  }

  classifyEntity(identifier: string): Observable<EntityClassificationDto> {
    const digits = identifier.replace(/\D/g, '');
    if (!digits) {
      return of({
        entityType: '',
        issues: [{ path: null, code: 'ID_EMPTY', message: 'Podaj identyfikator (NIP lub numer dokumentu).', severity: 'error' as const }],
      }).pipe(delay(300));
    }
    // 10 cyfr = NIP → jednoosobowa działalność; inaczej osoba fizyczna.
    const entityType = digits.length === 10 ? 'JDG' : 'OSOBA_FIZYCZNA';
    return of({ entityType }).pipe(delay(300));
  }

  resolveAddress(postalCode: string): Observable<AddressResolveDto> {
    const city = POSTAL_TO_CITY[postalCode] ?? null;
    const issues: ValidationIssueDto[] = city
      ? []
      : [{ path: null, code: 'POSTAL_UNKNOWN', message: `Nie znam miejscowości dla kodu ${postalCode} — wpisz ręcznie.`, severity: 'warning' as const }];
    return of({ postalCode, city, issues }).pipe(delay(250));
  }
}

/** Mapa kodu pocztowego → miejscowość (przykładowa — docelowo słownik z API). */
const POSTAL_TO_CITY: Record<string, string> = {
  '00-001': 'Warszawa',
  '31-000': 'Kraków',
  '32-552': 'Płaza',
  '80-001': 'Gdańsk',
};

const TEST_DOMAINS = ['example.pl', 'example.com', 'test.pl'];

/** Pierwsza cyfra kodu pocztowego dla większych miast. */
const CITY_ZIP_DIGIT: Record<string, string> = {
  warszawa: '0', białystok: '1', lublin: '2', kraków: '3', katowice: '4',
  wrocław: '5', poznań: '6', szczecin: '7', gdańsk: '8', łódź: '9',
};

function zipCityMismatch(address: string): string | null {
  const zip = /\b(\d{2}-\d{3})\b/.exec(address)?.[1];
  if (!zip) return null;
  const city = address
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .find((s) => CITY_ZIP_DIGIT[s] !== undefined);
  if (!city || zip.startsWith(CITY_ZIP_DIGIT[city])) return null;
  const name = city.charAt(0).toUpperCase() + city.slice(1);
  return `Kod pocztowy ${zip} nie pasuje do miejscowości ${name}.`;
}

const REFERRAL_TEST: ReferralCandidateDto[] = [
  { personId: 'P-1001', fullName: 'Tomasz Zieliński', phone: '+48601112233', city: 'Warszawa', lastContactDate: '2026-09-12' },
  { personId: 'P-1002', fullName: 'Ewa Dąbrowska', phone: '+48512223344', city: 'Kraków', lastContactDate: '2026-08-03' },
  { personId: 'P-1003', fullName: 'Paweł Szymański', phone: '+48698334455', city: 'Gdańsk' },
  { personId: 'P-1004', fullName: 'Agnieszka Woźniak', phone: '+48788445566', city: 'Poznań', lastContactDate: '2026-10-01' },
];

const RANDOM_NAMES = ['Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Katarzyna Wójcik', 'Marek Kamiński'];
const RANDOM_PHONES = ['601234567', '512998877', '690112233', '788554433', '501667788'];

/** Słowniki „z backendu" — bogatsze niż lokalne (dodatkowe pozycje, wagi, aliasy). */
const MOCK_DICTIONARIES: DictionaryDto[] = [
  {
    code: 'relacje',
    entries: [
      { code: 'ZNAJOMY', label: 'Znajomy', weight: 100 },
      { code: 'RODZINA', label: 'Rodzina', weight: 90 },
      { code: 'WSPOLPRACOWNIK', label: 'Współpracownik', weight: 80 },
      { code: 'SASIAD', label: 'Sąsiad', weight: 70 },
      { code: 'Z_POLECENIA', label: 'Z polecenia', weight: 60 },
      { code: 'KLIENT', label: 'Inny klient', weight: 50, aliases: ['klient'] },
      { code: 'PARTNER', label: 'Partner biznesowy', weight: 40, aliases: ['biznes'] },
      { code: 'SZKOLA', label: 'Szkoła / studia', weight: 30, aliases: ['szkoła', 'studia'] },
      { code: 'INNE', label: 'Inne', weight: 0 },
    ],
  },
  {
    code: 'zrodla',
    entries: [
      { code: 'POLECENIE', label: 'Polecenie', weight: 100 },
      { code: 'WWW', label: 'Strona internetowa', weight: 90, aliases: ['www', 'internet'] },
      { code: 'INFOLINIA', label: 'Infolinia', weight: 80 },
      { code: 'PLACOWKA', label: 'Placówka', weight: 70 },
      { code: 'EMAIL', label: 'Kampania e-mail', weight: 60, aliases: ['mail', 'newsletter'] },
      { code: 'SOCIAL', label: 'Media społecznościowe', weight: 50, aliases: ['facebook', 'social'] },
      { code: 'INNE', label: 'Inne', weight: 0 },
    ],
  },
];
