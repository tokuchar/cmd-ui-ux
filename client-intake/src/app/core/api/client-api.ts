import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { DictionaryDto } from './api.models';

/**
 * SZEW BACKENDU: jedyne wejście do usług zdalnych. Wersja MVP działa lokalnie
 * (profil i plan w localStorage), więc API ma tylko słowniki. Docelowo: zapis profilu,
 * planów i logów treningowych — podmiana w app.config.ts (`{ provide: CLIENT_API, useClass: … }`).
 */
export interface ClientApi {
  /** Słowniki pól wyboru (nadpisują lokalne z dictionaries.config.ts). */
  getDictionaries(): Observable<DictionaryDto[]>;
}

export const CLIENT_API = new InjectionToken<ClientApi>('CLIENT_API');
