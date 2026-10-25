import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
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
} from './api.models';

/**
 * SZEW MIGRACJI: jedyne wejście do backendu.
 * Obecnie implementacja = MockClientApi (mock-client-api.ts). Docelowo HttpClientApi
 * na HttpClient — podmiana w app.config.ts (`{ provide: CLIENT_API, useClass: … }`).
 * Instrukcja: docs/MIGRATION.md, krok 5.
 */
export interface ClientApi {
  /** Słowniki pól wyboru. */
  getDictionaries(): Observable<DictionaryDto[]>;
  /** Wstępny zapis (clientId = null) lub aktualizacja (clientId z poprzedniego zapisu). */
  savePreliminary(dto: PreliminaryClientDto, clientId: string | null): Observable<SavePreliminaryResponseDto>;
  /** Osoby polecające dla kodu. */
  searchReferrals(code: string): Observable<ReferralCandidateDto[]>;
  /** Walidacja całej karty — zwraca listę problemów ze ścieżkami pól DTO. */
  validateCard(dto: ClientCardDto): Observable<CardValidationDto>;
  /** Wstępne wczytanie danych klienta z zewnętrznego rejestru (prefill na starcie). */
  lookupClient(): Observable<ClientLookupDto>;
  /** Typ podmiotu (JDG itd.) po identyfikatorze — wynik znany dopiero po strzale. */
  classifyEntity(identifier: string): Observable<EntityClassificationDto>;
  /** Miejscowość dla kodu pocztowego + ewentualne „ulica/kod spoza słownika". */
  resolveAddress(postalCode: string): Observable<AddressResolveDto>;
}

export const CLIENT_API = new InjectionToken<ClientApi>('CLIENT_API');
