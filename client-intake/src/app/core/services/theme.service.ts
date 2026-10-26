import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'intake-theme';
const BG_KEY = 'intake-bg';

/** Jasny/ciemny motyw: klasa `.dark` na <html> przełącza tokeny z styles/tokens.css. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly isDark = signal(this.readStored());
  /** true = płaskie, jednokolorowe tło (bez animowanej aurory) — wspólne dla obu motywów. */
  readonly plainBg = signal(this.readStoredBg());

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

  togglePlainBg(): void {
    this.plainBg.update((v) => !v);
    try {
      localStorage.setItem(BG_KEY, this.plainBg() ? 'plain' : 'fx');
    } catch {
      /* brak dostępu do storage — ustawienie tylko na tę sesję */
    }
  }

  private readStoredBg(): boolean {
    try {
      return localStorage.getItem(BG_KEY) === 'plain';
    } catch {
      return false;
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
