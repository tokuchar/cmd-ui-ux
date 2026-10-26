import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { FieldIssue } from '../engine/field-def';
import { groupProgress, totalProgress } from '../engine/flow';
import { CollectionItem } from '../engine/step-def';
import { AthleteProfile, emptyAthlete } from '../models/athlete.model';
import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-store';
import { DictionaryService } from '../services/dictionary.service';

/** Gdzie jest operator. */
export type Cursor =
  | { kind: 'field'; step: number; field: number }
  | { kind: 'collection'; step: number }
  | { kind: 'item'; step: number; itemId: string; field: number }
  | { kind: 'done' };

/**
 * flow   — normalny przepływ krok po kroku,
 * single — pojedyncza edycja (dwuklik po zakończeniu) → powrót do podsumowania,
 * fix    — przejście po polach z błędami walidacji karty → ponowna walidacja.
 */
export type EditMode = 'flow' | 'single' | 'fix';

export type ValidationStatus = 'idle' | 'pending' | 'valid' | 'invalid' | 'error';

export interface Candidate {
  id: string;
  item: CollectionItem;
  excluded: boolean;
  done: boolean;
}

export interface CollectionState {
  code: string;
  phase: 'code' | 'loading' | 'select' | 'qa';
  candidates: Candidate[];
  /** Kolejka pytań: osoba × indeks pola z itemFields. */
  queue: { id: string; field: number }[];
  q: number;
}

export type EchoType = 'info' | 'success' | 'error' | 'warning';

export interface Echo {
  html: string;
  type: EchoType;
}

/** Stan aplikacji (signals). Zmieniany wyłącznie przez IntakeEngine. */
@Injectable({ providedIn: 'root' })
export class IntakeStore {
  private readonly cfg = inject(APP_CONFIG);
  private readonly dict = inject(DictionaryService);

  /** Profil odtwarzany z localStorage (nowe pola modelu uzupełniane wartościami pustymi). */
  readonly model = signal<AthleteProfile>({ ...emptyAthlete(), ...(readJson<AthleteProfile>(STORAGE_KEYS.profile) ?? {}) });
  readonly cursor = signal<Cursor>({ kind: 'field', step: 0, field: 0 });
  readonly mode = signal<'form' | 'command'>('form');
  readonly editMode = signal<EditMode>('flow');
  readonly reachedEnd = signal(false);
  /** Stan kolekcji per indeks kroku. */
  readonly collections = signal<Record<number, CollectionState>>({});

  readonly clientId = signal<string | null>(null);
  readonly validation = signal<ValidationStatus>('idle');
  readonly issues = signal<FieldIssue[]>([]);
  readonly fixQueue = signal<string[]>([]);
  readonly fixIndex = signal(0);

  /** Treść command line (two-way z komponentem). */
  readonly draft = signal('');
  readonly echo = signal<Echo>({ html: '', type: 'info' });
  readonly inputError = signal(false);
  /** Inkrementowane przy błędzie — wyzwala animację shake. */
  readonly errorTick = signal(0);
  /** Inkrementowane, gdy command line ma dostać fokus (select = zaznacz tekst). */
  readonly focusTick = signal({ n: 0, select: false });
  readonly busy = signal(false);

  readonly sheetOpen = signal(false);
  readonly selectedGroup = signal<string | null>(null);

  readonly groupProgress = computed(() => groupProgress(this.cfg.flow, this.model(), this.dict));
  readonly totalProgress = computed(() => totalProgress(this.cfg.flow, this.model(), this.dict));

  constructor() {
    // Autozapis profilu po każdej zmianie (bez backendu).
    effect(() => writeJson(STORAGE_KEYS.profile, this.model()));
  }
}
