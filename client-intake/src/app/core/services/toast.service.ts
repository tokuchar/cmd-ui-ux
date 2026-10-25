import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  leaving: boolean;
}

/** Powiadomienia w prawym dolnym rogu (3 s, jak w mockupie). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, message, leaving: false }]);
    setTimeout(() => this.toasts.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 3000);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 3300);
  }
}
