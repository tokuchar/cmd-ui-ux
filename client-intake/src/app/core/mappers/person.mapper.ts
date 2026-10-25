import { ReferralCandidateDto, ReferralDto } from '../api/api.models';
import { phoneDigits, toE164 } from '../engine/field-types';
import { Person } from '../models/customer.model';

/** Wynik wyszukiwania (DTO) → osoba w modelu. Dodatkowe dane z wyszukiwania mapuj tutaj. */
export function fromReferralCandidateDto(dto: ReferralCandidateDto): Person {
  return {
    id: dto.personId,
    imie: dto.fullName,
    telefon: phoneDigits(dto.phone),
    znam: '',
    miasto: dto.city,
    ostatniKontakt: dto.lastContactDate,
  };
}

export function toReferralDto(p: Person): ReferralDto {
  return {
    personId: p.id,
    fullName: p.imie,
    relation: p.znam,
    phone: toE164(p.telefon),
  };
}
