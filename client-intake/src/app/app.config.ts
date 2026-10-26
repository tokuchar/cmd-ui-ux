import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { CLIENT_API } from './core/api/client-api';
import { MockClientApi } from './core/api/mock-client-api';
import { APP_CONFIG, buildAppConfig } from './core/config/app-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Konfiguracja przepływu (kroki, słowniki, komendy).
    { provide: APP_CONFIG, useFactory: () => buildAppConfig() },
    // SZEW BACKENDU: podmień MockClientApi na implementację HttpClient (docs/MIGRATION.md).
    { provide: CLIENT_API, useClass: MockClientApi },
  ],
};
