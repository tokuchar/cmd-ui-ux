import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { DictionaryDto } from './api.models';
import { ClientApi } from './client-api';

/** Implementacja lokalna: brak backendu → słowniki tylko z dictionaries.config.ts. */
@Injectable()
export class MockClientApi implements ClientApi {
  getDictionaries(): Observable<DictionaryDto[]> {
    return of([]);
  }
}
