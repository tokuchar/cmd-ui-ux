import { ClientCardDto, PreliminaryClientDto } from '../api/api.models';
import { toE164 } from '../engine/field-types';
import { Customer } from '../models/customer.model';
import { toReferralDto } from './person.mapper';

/*
 * Model ↔ DTO dla klienta. Jedyne miejsce, które zna kształt ClientCardDto/PreliminaryClientDto.
 * Opis przepływu i przykłady: docs/DATA-FLOW.md.
 */

export function toPreliminaryDto(c: Customer): PreliminaryClientDto {
  return {
    firstName: c.imie,
    lastName: c.nazwisko,
    phone: toE164(c.telefon),
    email: c.email,
  };
}

export function toClientCardDto(c: Customer, clientId: string | null): ClientCardDto {
  return {
    clientId,
    client: {
      firstName: c.imie,
      lastName: c.nazwisko,
      phone: toE164(c.telefon),
      email: c.email,
      address: c.adres_klienta,
      ...(c.data_urodzenia ? { birthDate: c.data_urodzenia } : {}),
      ...(c.wojewodztwo ? { voivodeship: c.wojewodztwo } : {}),
      ...(c.zrodlo ? { acquisitionSource: c.zrodlo } : {}),
    },
    shipping: {
      sameAsClient: c.wysylka_same === true,
      address: c.wysylka_same === true ? c.adres_klienta : c.adres_wysylki,
    },
    referrals: c.polecajacy.map(toReferralDto),
  };
}
