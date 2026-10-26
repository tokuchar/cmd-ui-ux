import { Observable } from 'rxjs';
import type { ClientApi } from '../api/client-api';
import type { EffectResult, HookContext } from './step-def';

/**
 * Deklaracja pola — jedno pytanie w command line.
 *
 * Wejście/wyjście pola jest jawne:
 *  - WEJŚCIE  `input(model)`        → tekst wstawiany do command line (przy wejściu i powrocie),
 *  - PARSE    typ pola (field-types) → wartość domenowa albo błąd formatu,
 *  - WALIDACJA `validators`          → komunikat błędu albo null,
 *  - WYJŚCIE  `output(value, model)` → nowy model.
 * Domyślnie wejście/wyjście czytają i zapisują `model[id]` — nadpisuj tylko gdy trzeba
 * (np. „Imię i nazwisko" zapisywane do dwóch pól).
 *
 * Szczegóły i przykłady: docs/FIELD-TYPES.md, szablon: docs/templates/field.template.ts
 */
export interface FieldDef<M = any> {
  /** Ścieżka w modelu (`email`, `adres.kod`). Ten sam klucz używa walidacja karty (FieldIssue.fieldId). */
  id: string;
  type: FieldType;
  /** Nagłówek nad command line (np. „Numer telefonu"). */
  label: string;
  /** Etykieta wiersza w „Dane klienta" (domyślnie `label`). */
  sheetLabel?: string;
  placeholder?: string;
  /** Podpowiedź w polu echo. Zaufany HTML z konfiguracji — dane wstawiaj przez escapeHtml(). */
  hint: string | ((model: M) => string);

  /** Domyślnie true. Pole opcjonalne przyjmuje pusty wpis. */
  required?: boolean;
  /** Komunikat dla pustego wymaganego pola (domyślnie błąd parsowania typu lub ogólny). */
  requiredMessage?: string;

  /** Klucz słownika (select) — patrz dictionaries.config.ts / DictionaryService. */
  dictionary?: string;
  /** Opcje inline (gdy nie ma słownika). Kolejność = prawdopodobieństwo, pierwsza = domyślna. */
  options?: DictEntry[];
  /** select/multiselect: pozwala wpisać wartość spoza listy. */
  allowCustom?: boolean;
  /** scale/number: zakres wartości (np. skala bólu 0–10). */
  min?: number;
  max?: number;
  /**
   * select/boolean: gdy pole puste i brak podpowiedzi, wstaw pierwszą (najbardziej
   * prawdopodobną) opcję. Domyślnie true — jak w mockupie. Wyłącz dla długich słowników.
   */
  preselect?: boolean;

  validators?: ValidatorFn<M>[];
  /** Walidacja asynchroniczna (np. sprawdzenie w usłudze) — po przejściu walidacji synchronicznej. */
  asyncValidators?: AsyncValidatorFn<M>[];
  /**
   * Efekt async PO zatwierdzeniu pola: strzał do usługi i wpisanie wyniku do modelu / pokazanie
   * błędów biznesowych (np. kod pocztowy → miejscowość, NIP → typ podmiotu). W odróżnieniu od
   * `compute`/`suggest` (synchroniczne, czyste) może wołać API. Błąd usługi jest nieblokujący.
   */
  onCommit?: (ctx: HookContext<M>) => Observable<EffectResult<M>>;

  /** Czy pole jest pytane w przepływie (np. adres wysyłki tylko gdy „nie taki sam"). */
  visibleWhen?: (model: M) => boolean;
  /**
   * Pole WYLICZANE: gdy funkcja zwraca wartość ≠ undefined, silnik wpisuje ją do modelu
   * po każdej zmianie i nie pyta o pole. undefined = pole pytane normalnie.
   */
  compute?: (model: M) => unknown;
  /** Pole PODPOWIADANE: wstępna wartość (tekst do command line), operator zatwierdza Enterem. */
  suggest?: (model: M) => string | undefined;
  /** Wartość startowa, gdy pole jest puste i brak podpowiedzi (np. „Tak"). */
  defaultValue?: (model: M) => string;

  /** WEJŚCIE: tekst do command line. Domyślnie format(model[id]). */
  input?: (model: M) => string;
  /** WYJŚCIE: zapis sparsowanej wartości. Domyślnie model[id] = value. */
  output?: (value: any, model: M) => M;
  /** Tekst w „Dane klienta". Domyślnie jak `input`. */
  display?: (model: M) => string;
  /** Które pole edytować po dwukliku / przy poprawce (domyślnie to samo). */
  editTarget?: (model: M) => string;

  /** Pokazuj w „Dane klienta" (domyślnie true). */
  inSheet?: boolean;
  /** Licz do postępu (domyślnie true). */
  progress?: boolean;
  /** Szare segmenty formatu w ghost-text (nadpisuje domyślne dla typu, np. adresu). */
  ghost?: string[];
}

export type FieldType =
  | 'text'
  | 'phone'
  | 'email'
  | 'address'
  | 'date'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'scale'
  | 'lift'
  | 'boolean';

/** Pozycja słownika. `value` trafia do modelu/API, `label` widzi operator. */
export interface DictEntry {
  value: string;
  label: string;
  /** Dodatkowe frazy, po których można wybrać pozycję (np. skróty). */
  aliases?: string[];
}

/** Zwraca komunikat błędu (PL) albo null. `value` = wartość po sparsowaniu przez typ pola. */
export type ValidatorFn<M = any> = (value: any, model: M) => string | null;
/** Walidacja w usłudze — dostaje ClientApi (np. sprawdzenie NIP/duplikatu klienta). */
export type AsyncValidatorFn<M = any> = (value: any, model: M, api: ClientApi) => Observable<string | null>;

export type ParseResult = { ok: true; value: unknown } | { ok: false; reason: string };

/** Błąd z walidacji karty po zmapowaniu na pole. fieldId = null → błąd ogólny. */
export interface FieldIssue {
  fieldId: string | null;
  message: string;
  code?: string;
}
