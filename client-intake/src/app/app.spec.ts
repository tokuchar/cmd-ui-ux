import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App], providers: [...appConfig.providers, provideRouter(routes)] }).compileComponents();
  });

  it('renders the section tabs', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Intake');
    expect(el.textContent).toContain('Profil');
    expect(el.textContent).toContain('Plan');
  });
});
