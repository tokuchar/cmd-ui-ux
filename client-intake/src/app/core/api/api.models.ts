/**
 * Kontrakt REST (DTO) — analogiczny do API obecnej aplikacji.
 * MIGRACJA: podmień te typy na DTO z prawdziwego backendu (lub wygenerowane z OpenAPI),
 * a różnice wchłoń w mapperach (core/mappers). Komponenty DTO nie znają.
 */

/** POST /clients/preliminary — wstępny zapis klienta. */
export interface PreliminaryClientDto {
  firstName: string;
  lastName: string;
  /** E.164, np. +48601234567 */
  phone: string;
  email: string;
}

export interface SavePreliminaryResponseDto {
  clientId: string;
  created: boolean;
}

/** GET /referrals?code=… — wyszukiwanie osób po kodzie polecającym. */
export interface ReferralCandidateDto {
  personId: string;
  fullName: string;
  phone: string;
  city?: string;
  /** ISO date */
  lastContactDate?: string;
}

/** POST /clients/{id}/card/validate — cała karta do walidacji. */
export interface ClientCardDto {
  clientId: string | null;
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    birthDate?: string;
    voivodeship?: string;
    acquisitionSource?: string;
  };
  shipping: {
    sameAsClient: boolean;
    address: string;
  };
  referrals: ReferralDto[];
}

export interface ReferralDto {
  personId: string;
  fullName: string;
  relation: string;
  phone: string;
}

export interface CardValidationDto {
  valid: boolean;
  issues: ValidationIssueDto[];
}

export interface ValidationIssueDto {
  /** Ścieżka w ClientCardDto, np. `client.email`, `referrals[1].phone`; null = błąd ogólny. */
  path: string | null;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

/** GET /clients/lookup — wstępne wczytanie danych klienta z zewnętrznego rejestru (prefill). */
export interface ClientLookupDto {
  firstName: string;
  lastName: string;
  /** NIP albo numer dokumentu — do dalszej klasyfikacji. */
  identifier: string;
}

/** GET /entities/classify?identifier=… — typ podmiotu po identyfikatorze. */
export interface EntityClassificationDto {
  /** np. 'JDG', 'OSOBA_FIZYCZNA'. */
  entityType: string;
  issues?: ValidationIssueDto[];
}

/** GET /addresses/resolve?postalCode=… — podpowiedź miejscowości z kodu pocztowego. */
export interface AddressResolveDto {
  postalCode: string;
  city: string | null;
  issues?: ValidationIssueDto[];
}

/** GET /dictionaries — słowniki pól wyboru. */
export interface DictionaryDto {
  code: string;
  entries: DictionaryEntryDto[];
}

export interface DictionaryEntryDto {
  code: string;
  label: string;
  /** Wyższa waga = wyżej na liście (najbardziej prawdopodobne pierwsze). */
  weight?: number;
  aliases?: string[];
}
