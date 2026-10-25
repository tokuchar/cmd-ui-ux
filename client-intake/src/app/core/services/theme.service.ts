import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'intake-theme';

/** Jasny/ciemny motyw: klasa `.dark` na <html> przełącza tokeny z styles/tokens.css. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly isDark = signal(this.readStored());

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.isDark.update((v) => !v);
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, this.isDark() ? 'dark' : 'light');
    } catch {
      /* brak dostępu do storage — motyw tylko na tę sesję */
    }
  }

  private apply(): void {
    this.doc.documentElement.classList.toggle('dark', this.isDark());
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  }
}
