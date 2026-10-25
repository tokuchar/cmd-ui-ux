import { Observable } from 'rxjs';
import { ClientApi } from '../api/client-api';
import { FieldDef, FieldIssue } from './field-def';

/**
 * Wynik efektu async (prefill / onCommit / onComplete). Wszystkie pola opcjonalne:
 *  - `patch`  → scalony do modelu (np. prefill identyfikatorów, kod→miejscowość, typ podmiotu),
 *  - `issues` → błędy biznesowe z usługi, przypięte do pola / sekcji (fieldId = id grupy) / ogólne (null),
 *  - `toast`  → komunikat w toaście.
 * Efekt zwracający samo `toast` zachowuje się jak dawne `onComplete: Observable<string>`.
 */
export interface EffectResult<M = any> {
  patch?: Partial<M>;
  issues?: FieldIssue[];
  toast?: string;
}

/**
 * Sekcja w pipeline i w „Dane klienta" (np. Dane podstawowe, Adresy).
 * `color` = zmienna CSS z styles/tokens.css (np. 'var(--group-1)').
 */
export interface GroupDef<M = any> {
  id: string;
  label: string;
  color: string;
  /**
   * Wywoływane po każdym zatwierdzeniu pola z tej grupy, gdy grupa jest kompletna
   * (np. wstępny zapis klienta przez REST). Zwrócony string trafia do toasta;
   * zwrócony EffectResult pozwala dodatkowo wpisać patch do modelu i błędy biznesowe
   * z usługi na pola/sekcje (np. „niepełnoletni musi mieć legitymację").
   */
  onComplete?: (ctx: HookContext<M>) => Observable<EffectResult<M> | string | void>;
}

/** Krok = „Krok N / M" w liczniku. Pola kroku są zadawane po kolei w command line. */
export interface StepDef<M = any> {
  id: string;
  group: string;
  /** Pytania kroku. Pusta lista, gdy krok jest kolekcją. */
  fields: FieldDef<M>[];
  /** Krok-kolekcja (lista osób): kod → wybór ✕ → pytania o każdą osobę. */
  collection?: CollectionDef<M>;
}

/**
 * Kolekcja (wzorzec „Osoby polecające"):
 * 1) operator wpisuje kod wyszukiwania → `load` pobiera kandydatów,
 * 2) wyszarza ✕ niechcianych,
 * 3) silnik pyta o `itemFields` każdej osoby. Wynik trafia do model[target].
 */
export interface CollectionDef<M = any, I extends CollectionItem = any> {
  /** Ścieżka listy w modelu, np. 'polecajacy'. Błędy: `polecajacy[1].telefon`. */
  target: string;
  label: string;
  sheetLabel: string;
  placeholder: string;
  hint: string;
  /** Wzorzec i komunikat dla kodu wyszukiwania. */
  codePattern: RegExp;
  codeError: string;
  /** Pobranie kandydatów (przez API + mapper). */
  load: (code: string, ctx: HookContext<M>) => Observable<I[]>;
  /** Nazwa osoby na liście i w pytaniach. */
  itemLabel: (item: I) => string;
  /** Dodatkowe dane osoby z wyszukiwania (druga linia na liście). */
  itemDetail?: (item: I) => string;
  /** Pytania o każdą osobę (model = osoba). */
  itemFields: FieldDef<I>[];
  /** Tekst wiersza w „Dane klienta". */
  summary: (items: I[]) => string;
  /** Czy kolekcja liczy się do % całości (domyślnie nie — tylko do % grupy). */
  countInTotal?: boolean;
}

export interface CollectionItem {
  id: string;
  [key: string]: unknown;
}

/** Cały przepływ: grupy, kroki, model startowy i walidacja karty. */
export interface FlowDef<M = any> {
  groups: GroupDef<M>[];
  steps: StepDef<M>[];
  emptyModel: () => M;
  /**
   * Wstępne wczytanie danych z usługi na starcie przepływu (np. identyfikatory, imię/nazwisko
   * z zewnętrznego endpointu). Wywoływane raz na start/„od nowa"; wynik scalany do modelu.
   */
  prefill?: (ctx: HookContext<M>) => Observable<EffectResult<M>>;
  /** Etykieta klienta do toastów („Jan Kowalski"). */
  title: (model: M) => string;
  /** Walidacja całej karty w usłudze → błędy zmapowane na pola (mappers/validation-error.mapper). */
  validateCard: (model: M, ctx: HookContext<M>) => Observable<FieldIssue[]>;
}

/** Kontekst przekazywany do funkcji konfiguracji, które rozmawiają z backendem. */
export interface HookContext<M = any> {
  model: M;
  api: ClientApi;
  /** Identyfikator klienta z wstępnego zapisu (null przed zapisem). */
  clientId: string | null;
  setClientId: (id: string) => void;
}
