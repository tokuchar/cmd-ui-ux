import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IntakePage } from './features/intake/intake-page';

@Component({
  selector: 'app-root',
  imports: [IntakePage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-intake-page />',
})
export class App {}
