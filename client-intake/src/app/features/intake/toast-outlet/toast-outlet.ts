import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none' },
  template: `
    @for (t of toasts.toasts(); track t.id) {
      <div
        class="p-3 rounded-xl shadow-lg border text-xs font-mono font-semibold transition-all duration-300 fade-in-up pointer-events-auto bg-app-surface border-brand/30 text-app-text flex items-center gap-2"
        [style.opacity]="t.leaving ? 0 : null"
      >
        <span>{{ t.message }}</span>
      </div>
    }
  `,
})
export class ToastOutlet {
  protected readonly toasts = inject(ToastService);
}
