import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { IntakeEngine } from '../../../core/engine/intake-engine';

/** Szuflada „Dane klienta" (wyjeżdża z dołu). Dwuklik w wiersz → edycja w command line. */
@Component({
  selector: 'app-data-sheet',
  templateUrl: './data-sheet.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataSheet {
  protected readonly engine = inject(IntakeEngine);
  protected readonly s = this.engine.s;
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  protected readonly highlighted = signal<string | null>(null);

  constructor() {
    // Klik w sekcję pipeline: przewiń do grupy i podświetl ją na chwilę (jak w mockupie).
    effect(() => {
      const group = this.s.selectedGroup();
      if (!this.s.sheetOpen() || !group) return;
      setTimeout(() => {
        this.body().nativeElement.querySelector(`[data-group="${group}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.highlighted.set(group);
        setTimeout(() => this.highlighted.set(null), 1200);
      }, 320);
    });
  }

  protected toggle(): void {
    if (this.s.sheetOpen()) this.engine.closeSheet();
    else this.engine.openSheet();
  }
}
