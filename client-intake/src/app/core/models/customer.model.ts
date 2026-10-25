import { CollectionItem } from '../engine/step-def';

/**
 * Model domenowy karty klienta — to, co trzyma UI. Kształt API (DTO) jest osobno
 * (api/api.models.ts), a tłumaczenie robią mappery (mappers/*).
 * Migracja: rozszerz model o pola docelowej aplikacji + dopisz je w mapperach.
 */
export interface Customer {
  imie: string;
  nazwisko: string;
  /** 9 cyfr, bez +48 i spacji (formatowanie robi typ pola `phone`). */
  telefon: string;
  email: string;
  adres_klienta: string;
  /** null = jeszcze nie odpowiedziano. */
  wysylka_same: boolean | null;
  adres_wysylki: string;
  polecajacy: Person[];

  /* --- Pola demonstracyjne (krok „Dane dodatkowe", włączany ?demo=1) --- */
  /** ISO RRRR-MM-DD */
  data_urodzenia: string;
  /** Wyliczane z daty urodzenia. */
  wiek: number | null;
  /** Kod ze słownika `wojewodztwa`, podpowiadany z kodu pocztowego. */
  wojewodztwo: string;
  /** Kod ze słownika `zrodla`. */
  zrodlo: string;

  /* --- Pola integracji z usługami (demo: prefill, klasyfikacja, słownik adresu) --- */
  /** NIP / numer dokumentu — prefill z rejestru, podstawa klasyfikacji podmiotu. */
  identyfikator: string;
  /** Typ podmiotu (np. JDG) — wyliczany przez usługę po identyfikatorze (onCommit). */
  typPodmiotu: string;
  /** Kod pocztowy — po zatwierdzeniu podpowiada miejscowość z usługi. */
  kod_pocztowy: string;
  /** Miejscowość — podpowiadana z kodu pocztowego, operator może nadpisać. */
  miejscowosc: string;
}

/** Osoba z kolekcji (osoba polecająca). Pola spoza pytań przychodzą z wyszukiwania. */
export interface Person extends CollectionItem {
  id: string;
  /** Imię i nazwisko. */
  imie: string;
  /** 9 cyfr. */
  telefon: string;
  /** Kod ze słownika `relacje` albo wpisany tekst. */
  znam: string;
  /** Dodatkowe dane z wyszukiwania — wyświetlane na liście kandydatów. */
  miasto?: string;
  ostatniKontakt?: string;
}

export function emptyCustomer(): Customer {
  return {
    imie: '',
    nazwisko: '',
    telefon: '',
    email: '',
    adres_klienta: '',
    wysylka_same: null,
    adres_wysylki: '',
    polecajacy: [],
    data_urodzenia: '',
    wiek: null,
    wojewodztwo: '',
    zrodlo: '',
    identyfikator: '',
    typPodmiotu: '',
    kod_pocztowy: '',
    miejscowosc: '',
  };
}
