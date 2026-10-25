import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { appConfig } from './app.config';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: appConfig.providers }).compileComponents();
  });

  it('renders the first step of the command line', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('label[for="cmdInput"]')?.textContent).toContain('Imię i nazwisko');
    expect(el.textContent).toContain('Krok 1 / 6');
  });
});
