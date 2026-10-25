import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { CLIENT_API } from './core/api/client-api';
import { MockClientApi } from './core/api/mock-client-api';
import { APP_CONFIG, buildAppConfig, featuresFromUrl } from './core/config/app-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Konfiguracja przepływu (kroki, słowniki, komendy). ?demo=1 → krok demonstracyjny.
    { provide: APP_CONFIG, useFactory: () => buildAppConfig(featuresFromUrl(location.search)) },
    // SZEW MIGRACJI: podmień MockClientApi na implementację HttpClient (docs/MIGRATION.md, krok 5).
    { provide: CLIENT_API, useClass: MockClientApi },
  ],
};
