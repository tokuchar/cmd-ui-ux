import { randomFrom } from '../engine/text';
import { Customer } from '../models/customer.model';
import { DICTIONARIES } from './dictionaries.config';
import { voivodeshipFromAddress } from './steps/dodatkowe.steps';

/** Dane DEV dla komend `fake …` (1:1 z mockupu). */
export const FAKE = {
  names: ['Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Katarzyna Wójcik', 'Marek Kamiński', 'Magdalena Lewandowska'],
  phones: ['601234567', '512998877', '690112233', '788554433', '501667788'],
  emails: ['jan.kowalski@example.pl', 'anna.nowak@test.pl', 'kontakt@firma.pl', 'biuro@sklep.com.pl'],
  addrs: [
    'ul. Długa 5, Warszawa, 00-123',
    'ul. Krótka 2, Kraków, 30-002',
    'al. Lipowa 10, Gdańsk, 80-001',
    'ul. Słoneczna 14/3, Poznań, 61-001',
  ],
  birthDates: ['1985-03-14', '1972-11-02', '1990-06-30', '1964-01-19'],
};

export interface FakePreset<M> {
  /** Co wypełniono — do komunikatu „🧪 [DEV] Wypełniono: …". */
  label: string;
  fill: (model: M) => M;
}

/** Klucz = drugie słowo komendy (`fake ctct`). Aliasy jak w mockupie. */
export const FAKE_PRESETS: Record<string, FakePreset<Customer>> = {
  ctct: {
    label: 'kontakt (imię, nazwisko, telefon)',
    fill: (c) => {
      const n = randomFrom(FAKE.names).split(' ');
      return { ...c, imie: n[0], nazwisko: n.slice(1).join(' '), telefon: randomFrom(FAKE.phones) };
    },
  },
  mail: { label: 'e-mail', fill: (c) => ({ ...c, email: randomFrom(FAKE.emails) }) },
  adr: {
    label: 'adres klienta i wysyłki',
    fill: (c) => ({ ...c, adres_klienta: randomFrom(FAKE.addrs), wysylka_same: false, adres_wysylki: randomFrom(FAKE.addrs) }),
  },
  dod: {
    label: 'dane dodatkowe (demo)',
    fill: (c) => ({
      ...c,
      data_urodzenia: randomFrom(FAKE.birthDates),
      wojewodztwo: codeFor(voivodeshipFromAddress(c.adres_klienta)) ?? 'MZ',
      zrodlo: 'WWW',
    }),
  },
};

export const FAKE_ALIASES: Record<string, string> = { kontakt: 'ctct', email: 'mail', adres: 'adr' };

/** `fake all` — kolejność wypełniania. */
export const FAKE_ALL = ['ctct', 'mail', 'adr'];

function codeFor(label: string | undefined): string | undefined {
  return DICTIONARIES['wojewodztwa'].find((e) => e.label === label)?.value;
}
