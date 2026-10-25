import { DictionaryDto } from '../api/api.models';
import { DictEntry } from '../engine/field-def';

/** Słowniki z API → pozycje dla pól select, posortowane od najbardziej prawdopodobnej. */
export function fromDictionaryDtos(dtos: DictionaryDto[]): Record<string, DictEntry[]> {
  const out: Record<string, DictEntry[]> = {};
  for (const dto of dtos) {
    out[dto.code] = [...dto.entries]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .map((e) => ({ value: e.code, label: e.label, aliases: e.aliases }));
  }
  return out;
}
