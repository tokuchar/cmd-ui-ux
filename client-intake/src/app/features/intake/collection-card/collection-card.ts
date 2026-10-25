import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { APP_CONFIG } from '../../../core/config/app-config';
import { fieldDisplay } from '../../../core/engine/field-runtime';
import { IntakeEngine } from '../../../core/engine/intake-engine';
import { DictionaryService } from '../../../core/services/dictionary.service';

/** Karta „Osoby polecające": wybór (✕/↩) i postęp pytań o każdą osobę. */
@Component({
  selector: 'app-collection-card',
  templateUrl: './collection-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionCard {
  protected readonly engine = inject(IntakeEngine);
  private readonly cfg = inject(APP_CONFIG);
  private readonly dict = inject(DictionaryService);

  protected readonly view = computed(() => {
    const cur = this.engine.s.cursor();
    if (cur.kind !== 'collection' || this.engine.s.mode() === 'command') return null;
    const st = this.engine.s.collections()[cur.step];
    if (!st || (st.phase !== 'select' && st.phase !== 'qa')) return null;
    const col = this.cfg.flow.steps[cur.step].collection!;
    const active = st.candidates.filter((c) => !c.excluded);
    const currentId = st.phase === 'qa' ? st.queue[st.q]?.id : null;
    return {
      step: cur.step,
      title: col.label,
      phase: st.phase,
      summary: st.phase === 'qa' ? `(${st.candidates.filter((c) => c.done).length}/${active.length} uzupełnionych)` : `(${active.length}/${st.candidates.length} wybranych)`,
      rows: st.candidates.map((c, i) => {
        const answered = col.itemFields.map((f) => fieldDisplay(f, c.item, this.dict)).filter(Boolean);
        return {
          id: c.id,
          no: i + 1,
          name: col.itemLabel(c.item),
          detail: col.itemDetail?.(c.item) ?? '',
          answers: c.done || answered.length ? answered.join(' · ') : '',
          excluded: c.excluded,
          done: c.done,
          current: c.id === currentId,
        };
      }),
    };
  });
}
