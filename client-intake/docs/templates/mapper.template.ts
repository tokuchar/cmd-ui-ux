// SZABLON MAPPERA — model ↔ DTO. Konwersje formatów TYLKO tutaj.
// Każde nowe pole: linia w to…Dto, linia w from…Dto (jeśli przychodzi z API), test w mappers.spec.ts.
import { toE164 } from '../../src/app/core/engine/field-types';
import { Customer } from '../../src/app/core/models/customer.model';

/** DTO z backendu (docelowo z OpenAPI, w core/api/api.models.ts). */
export interface <Nazwa>Dto {
  <poleDto>: string;
}

export function to<Nazwa>Dto(c: Customer): <Nazwa>Dto {
  return {
    <poleDto>: c.<pole>,
    // telefon:   phone: toE164(c.telefon),
    // data ISO:  birthDate: c.data_urodzenia || undefined,
    // słownik:   voivodeship: c.wojewodztwo,          // kod, nie etykieta
    // warunkowe: ...(c.wysylka_same ? {} : { shipping: c.adres_wysylki }),
  };
}

export function from<Nazwa>Dto(dto: <Nazwa>Dto): Partial<Customer> {
  return {
    <pole>: dto.<poleDto>,
  };
}

// Pamiętaj: ścieżki błędów walidacji dla nowych pól → ISSUE_PATH_MAP (validation-error.mapper.ts).
void toE164;
