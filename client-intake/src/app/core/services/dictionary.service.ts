import { inject, Injectable, signal } from '@angular/core';
import { CLIENT_API } from '../api/client-api';
import { APP_CONFIG } from '../config/app-config';
import { DictEntry } from '../engine/field-def';
import { TypeContext } from '../engine/field-types';
import { fromDictionaryDtos } from '../mappers/dictionary.mapper';

/**
 * Słowniki pól wyboru. Start: lokalne z dictionaries.config.ts, potem nadpisane
 * danymi z ClientApi.getDictionaries() (klucz po kluczu). Odczyt jest reaktywny (signal).
 */
@Injectable({ providedIn: 'root' })
export class DictionaryService implements TypeContext {
  private readonly api = inject(CLIENT_API);
  private readonly entries = signal<Record<string, DictEntry[]>>({ ...inject(APP_CONFIG).dictionaries });

  constructor() {
    this.api.getDictionaries().subscribe({
      next: (dtos) => this.entries.update((cur) => ({ ...cur, ...fromDictionaryDtos(dtos) })),
      error: () => console.warn('Nie udało się pobrać słowników — używam lokalnych.'),
    });
  }

  dictionary(key: string): DictEntry[] {
    return this.entries()[key] ?? [];
  }
}
