/**
 * Kształt danych z backendu (DTO). Model domenowy UI jest osobno (models/*),
 * tłumaczenie robią mappery (mappers/*).
 */

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
