import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IntakeEngine } from '../../../core/engine/intake-engine';

/** Pasek sekcji (Dane podstawowe → Adresy → Osoby polecające). Klik otwiera „Dane klienta" na grupie. */
@Component({
  selector: 'app-pipeline-bar',
  templateUrl: './pipeline-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-stretch gap-1.5 flex-1 min-w-0' },
})
export class PipelineBar {
  protected readonly engine = inject(IntakeEngine);

  protected click(group: string): void {
    const s = this.engine.s;
    if (s.sheetOpen() && s.selectedGroup() === group) this.engine.closeSheet();
    else this.engine.openSheet(group);
  }
}
