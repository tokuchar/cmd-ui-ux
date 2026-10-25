import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { IntakeEngine } from '../../core/engine/intake-engine';
import { ThemeService } from '../../core/services/theme.service';
import { AnimatedBackground } from './animated-background/animated-background';
import { CollectionCard } from './collection-card/collection-card';
import { CommandLine } from './command-line/command-line';
import { DataSheet } from './data-sheet/data-sheet';
import { PipelineBar } from './pipeline-bar/pipeline-bar';
import { ToastOutlet } from './toast-outlet/toast-outlet';

/** Ekran „Zakładanie klienta" — układ 1:1 z mockupem. */
@Component({
  selector: 'app-intake-page',
  templateUrl: './intake-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedBackground, PipelineBar, CommandLine, CollectionCard, DataSheet, ToastOutlet],
  host: { class: 'contents' },
})
export class IntakePage {
  protected readonly engine = inject(IntakeEngine);
  protected readonly theme = inject(ThemeService);

  constructor() {
    this.engine.start();
  }

  /** ⌘K / Ctrl+K komendy · ⌘F formularz · ⌘Q motyw · ⌘J „Dane klienta". */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    const command = this.engine.s.mode() === 'command';
    if (k === 'k' && !command) {
      e.preventDefault();
      this.engine.toggleCommandMode(true);
    } else if (k === 'f' && command) {
      e.preventDefault();
      this.engine.toggleCommandMode(false);
    } else if (k === 'q') {
      e.preventDefault();
      this.theme.toggle();
    } else if (k === 'j') {
      e.preventDefault();
      if (this.engine.s.sheetOpen()) this.engine.closeSheet();
      else this.engine.openSheet();
    }
  }
}
