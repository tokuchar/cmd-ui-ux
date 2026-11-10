# Refaktor wizarda (Angular + Spring Boot): przepływ danych, spójny UI, testowalne stany

## Kontekst

Wizard w innym repo:

- **Niespójne kontrolki.** Każdy krok składa formularz po swojemu.
- **Walidacja dopiero na końcu.** Reguły biznesowe żyją w backendzie i odpalają przy submit.
- **Dużo danych do wprowadzenia**, zanim dojdzie się do dalszych kroków.
- **Backend = logika + przemapowania** na zewnętrzne usługi SOAP/REST. Część zachowania wizarda zależy od odpowiedzi tych usług.
- **Brak sposobu, żeby ręcznie dojść do konkretnego stanu** bez klikania 10 minut. Bez tego każdy refaktor i każdy test to „masakra”.
- **LLM sobie nie radzi**, bo nie ma jednego źródła prawdy (model danych, reguły, konwencje UI, sposób odtworzenia stanu).

**Cel:** refaktor jako seria małych, mechanicznych, weryfikowalnych zadań, a każdy stan wizarda odtwarzalny jednym kliknięciem / jednym requestem.

> **Kluczowa decyzja architektoniczna**, z której wynika reszta: stan wizarda to jeden serializowalny dokument (`WizardDraft`, JSON), a cały świat zewnętrzny (SOAP/REST) jest za portami, które można podmienić na mock.

---

## Faza 0: Siatka bezpieczeństwa

- e2e (Playwright): golden path plus jeden scenariusz błędu biznesowego.
- Helpery per krok (`fillStep3(page, data)`), żeby już na starym wizardzie dało się szybko dochodzić do kroku N. To tymczasowa proteza, dopóki nie ma Fazy 2.
- Zrzuty ekranu każdego kroku jako „przed”.

---

## Faza 1: Inwentaryzacja (zadania dla LLM, krok po kroku)

`docs/wizard/inventory.md`, jedna tabela per krok:

| krok | pole (ścieżka) | typ semantyczny | kontrolka dziś | kontrolka docelowa (z katalogu, Faza 4) | wymagane? | walidacja FE | walidacja BE | zależy od | źródło danych / usługa zewn. |
|---|---|---|---|---|---|---|---|---|---|

Kolumna „typ semantyczny” przyjmuje wartości ze słownika z Fazy 4 (np. `yes-no`, `consent`, `enum-small`, `dict`, `nip`, `amount`…). Kontrolka docelowa wynika z niej mechanicznie, więc rozbieżność „dziś vs docelowo” to od razu lista rzeczy do poprawy.

Plus dwie listy:

- **reguły biznesowe**: co się wywala przy submit, gdzie w kodzie, których pól dotyczy;
- **wywołania usług zewnętrznych**: który krok/akcja, która usługa (SOAP/REST), jakie pola idą, co wraca i co z tego wynika dla UI. To tylko indeks; szczegóły per wywołanie są w katalogu z Fazy 2c.

### 1b. Wygenerowana struktura na uwagi (flow i wygląd kontrolek)

Skrypt `scripts/gen-feedback.ts` z inventory i katalogu kontrolek generuje szkielet, w który człowiek (Ty, tester, UX) wpisuje uwagi:

```
docs/wizard/feedback/
  README.md              ← jak pisać uwagi, statusy, kto triażuje
  flow.md                ← uwagi do całego przepływu: kolejność kroków, co przenieść wcześniej, co wyciąć
  controls.md            ← uwagi per typ kontrolki z katalogu (dotyczą wszystkich wystąpień)
  step-01.md … step-NN.md
```

Plik kroku (`step-NN.md`) zawiera:

- **nagłówek**: cel kroku, scenariusz do załadowania (`?scenario=…`), link do odpowiednich `docs/wizard/api/*`;
- **Flow kroku**: puste miejsce na uwagi, np. „za dużo pól”, „to powinno być wcześniej”, „brakuje prefillu”;
- **tabela pól** (wygenerowana z inventory):

| ID | pole | typ semantyczny | kontrolka dziś → docelowa | uwaga: wygląd | uwaga: flow | status | decyzja |
|---|---|---|---|---|---|---|---|
| FB-03-001 | `company.nip` | `nip` | `input` → `app-id-field` | | | open | |

**Zasady:**

- **Stabilne ID** (`FB-<krok>-<nr>`), żeby taski, commity i review mogły się do nich odwoływać.
- **Statusy:** `open` → `accepted` / `rejected` → `done`. Kolumnę „decyzja” wypełnia triaż.
- **Regeneracja jest addytywna.** Skrypt dopisuje nowe pola i oznacza usunięte jako `removed`, ale nigdy nie nadpisuje wpisanych uwag.
- **Triaż** (Opus, raz na partię uwag): `open` → decyzje → nowe/zmienione pliki w `docs/wizard/tasks/`, z linkami do ID. Uwagi do `controls.md` (feedback) zmieniają katalog kontrolek, a więc wszystkie kroki naraz.
- **Sonnet przy migracji kroku** czyta tylko wiersze `accepted` ze swojego `step-NN.md`, a nie cały feedback. Oszczędność tokenów.
- Po zrobieniu zmiany commit/task oznacza wiersz jako `done`. `check-feedback` (Warstwa 1 review) wypisuje kroki z `accepted`, które nie są `done`.
- **Opcjonalnie:** przycisk „Dodaj uwagę” w dev panelu. Klik na pole, wpisanie tekstu, a dev endpoint dopisuje wiersz do `step-NN.md` z ID pola i aktualnym scenariuszem, więc uwaga jest od razu reprodukowalna.

---

## Faza 2: Mechanizm dochodzenia do stanu

> **Priorytet** — robić przed refaktorem UI.

### 2a. Mock usług zewnętrznych (backend)

Niezależny od frontu, do zrobienia od razu.

- Wywołania SOAP/REST schowane za interfejsami (port/adapter), jeśli jeszcze nie są.
- **WireMock** (kontener w docker-compose albo in-process na profilu `mock`). Obsługuje i REST, i SOAP (matching po XPath w body).
- Stuby w repo: `mocks/wiremock/mappings/<usługa>/<scenariusz>.json`.
- **Sterowanie odpowiedzią przez dane wejściowe**, np. konkretny NIP/PESEL/numer klienta → konkretna odpowiedź (OK, odrzucenie, timeout, błąd techniczny). Tester wie, że „NIP 1111111111 = klient zablokowany”. Lista „magicznych wartości” trafia do `docs/wizard/test-data.md`.
- Startowe stuby można nagrać z WireMock w trybie record/proxy na środowisku testowym, a potem je zanonimizować.
- *Alternatywa lżejsza:* fake adaptery Springa na profilu `mock`. Gorsza, bo nie testuje mapowań XML/JSON, a to tam siedzi duża część logiki.

### Uruchomienie lokalne na mockach: wszystko pod `localhost:4200`

Jeden adres dla testera i dla e2e: **`http://localhost:4200`**. Front (`ng serve`) proxuje wywołania do backendu na profilu `mock`, więc nie trzeba pamiętać portów ani konfigurować CORS.

- **Backend:** `./gradlew bootRun --args='--spring.profiles.active=mock'` (WireMock z 2a in-process albo z docker-compose).
- **Front:** `ng serve --proxy-config proxy.conf.json` (albo `npm run start:mock`).
- **`proxy.conf.json`:** `/api/**` i `/dev/**` → backend (np. `http://localhost:8080`). Ścieżka `/mock/**` **nie** jest proxowana — to trasy Angulara (Faza 4.0a).
- **Co jest dostępne pod `localhost:4200`:**
  - `/wizard?scenario=<nazwa>` — wizard załadowany ze scenariusza (2b);
  - `/wizard?draft=<id>` — wizard z istniejącego draftu;
  - `/mock` — indeks wszystkich kontrolek z katalogu;
  - `/mock/<nazwa-kontrolki>` — pojedyncza kontrolka na zmockowanych danych, np. `/mock/address` (Faza 4.0a).
- Jedna komenda stawiająca całość: `scripts/run-mock.sh` (backend + front, czeka aż `localhost:4200` odpowiada, wypisuje URL-e). Używa jej skill `wizard-run-mock` i Playwright (`webServer` w `playwright.config.ts`).

### 2b. Seedowanie stanu wizarda (scenariusze)

- **Draft po stronie serwera:** `WizardDraft` zapisywany po każdym kroku (`PUT /api/wizard/drafts/{id}`), razem z `currentStep` i wynikami wywołań zewnętrznych potrzebnymi dalej.
  **Wymóg:** stan da się w całości odtworzyć z draftu — bez historii nawigacji, bez `sessionStorage` i bez danych w routerze.
- **Scenariusze jako pliki JSON w repo:** `scenarios/<nazwa>.json = { draft, step, mockProfile }`, np. `firma-krok5-po-weryfikacji`, `osoba-fizyczna-odrzucenie-kyc`.
- **Dev-only endpoint** (profil `dev`/`mock`, nigdy prod): `POST /dev/wizard/scenarios/{name}` → tworzy draft, zwraca `draftId`.
- **Front:** wejście przez `/wizard?draft={id}` albo `/wizard?scenario={name}` (tylko build dev) od razu otwiera właściwy krok z wypełnionymi danymi.
- **Dev panel w Angularze** (flaga `environment.devTools`):
  - lista scenariuszy → „Załaduj”;
  - „Skocz do kroku N” (omija guardy);
  - „Wypełnij ten krok przykładowymi danymi”;
  - „Eksportuj bieżący stan jako scenariusz”: tester dochodzi raz ręcznie, zapisuje JSON, wrzuca do repo / do zgłoszenia błędu.
- **Te same scenariusze w e2e:** test startuje od seeda, a nie od klikania od kroku 1. Testy są szybkie i odporne na zmiany wcześniejszych kroków.
- **Builder w testach backendu** (`WizardDraftBuilder.firma().poKroku(4).build()`) korzysta z tych samych danych.

### 2c. Katalog wywołań: nasz endpoint → usługa pod spodem, z mapowaniem i przykładami

Dla każdego endpointu backendu używanego przez wizard osobny folder `docs/wizard/api/<nazwa-wywolania>/`:

```
README.md                     ← opis + tabele mapowań + curle
our-request.json              ← przykładowe body do naszego serwisu
our-response.json             ← przykładowa odpowiedź naszego serwisu
our-error-*.json              ← przykładowe błędy (ProblemDetail)
downstream-request.xml|json   ← co faktycznie leci do usługi zewn.
downstream-response.xml|json  ← co usługa zwraca
variants/<wariant>/…          ← odrzucenie, timeout, błąd techniczny
```

`README.md` — stały szablon:

1. **Gdzie w wizardzie:** krok i akcja UI (np. „krok 2, blur na NIP → prefill danych firmy”).
2. **Nasz serwis:** gotowy curl na localhost (profil `mock`) plus link do `our-response.json` i błędów.
3. **Pod spodem:** usługa, operacja (SOAPAction / metoda + ścieżka REST), środowisko testowe. Gotowy curl do usługi (dla SOAP z kopertą i nagłówkami) plus link do `downstream-response.*`.
4. **Mapowanie requestu:** tabela *nasze pole → pole usługi | transformacja* (format daty, słownik, stała, warunek).
5. **Mapowanie odpowiedzi:** tabela *pole usługi → nasze pole | transformacja*.
6. **Mapowanie błędów:** *kod/fault usługi → nasz kod błędu → komunikat w UI*.
7. **Warianty i magiczne wartości:** jaka wartość wejściowa daje który wariant odpowiedzi na mocku.
8. **Klasy w kodzie:** kontroler, use case, mapper, klient (ścieżki).

**Jedno źródło przykładów, trzy zastosowania** (dzięki temu dokumentacja się nie rozjeżdża z kodem):

- **Mock:** stuby WireMock z 2a wskazują na `downstream-response.*` przez `bodyFileName`, bez kopiowania payloadów.
- **Testy mapperów (golden files):** `our-request.json` → mapper → ma się równać `downstream-request.*`; `downstream-response.*` → mapper → ma się równać `our-response.json`. Zmiana mapowania bez aktualizacji przykładów kończy się czerwonym testem.
- **Dokumentacja i ręczne testy:** curle działają od ręki. Dodatkowo plik `call.http` dla klienta HTTP w IntelliJ.

**Pozyskanie przykładów bez ręcznego klepania** — tryb nagrywania (profil `dev`/`mock`):

- filtr na kontrolerach wizarda plus interceptor na klientach SOAP/REST zapisują pary request/response obu stron do `captures/<czas>-<wywołanie>/` i od razu generują gotowe curle;
- dane wrażliwe maskowane w interceptorze;
- przejście wizarda raz na środowisku testowym daje surowiec. LLM (skill `wizard-api-doc`) tylko przenosi pliki do katalogu i pisze tabele mapowań, czytając jeden mapper.

---

## Faza 3: Przeprojektowanie przepływu danych („fail fast” + mniej wpisywania)

- **Kolejność kroków wg ryzyka.** Na początek dane, które mogą zdyskwalifikować proces albo determinują resztę. Wywołania zewnętrzne, które mogą odrzucić (weryfikacje), robić jak najwcześniej, zaraz po zebraniu potrzebnego minimum.
- **Mniej ręcznego wprowadzania:**
  - prefill z usług zewnętrznych po kluczu (NIP/PESEL/nr klienta → dane);
  - pola warunkowe ukryte, dopóki nie są potrzebne;
  - sensowne domyślne wartości.
- **Krok 0: „co będzie potrzebne”**, czyli checklista przed startem.
- **Trzy poziomy walidacji:**
  1. **pole** (format, wymagalność): Angular, po blur;
  2. **krok** (reguły krzyżowe): przed „Dalej”;
  3. **serwer** (reguły biznesowe i usługi zewn.): per krok.
- **Backend: Bean Validation groups per krok.**
  - Jeden DTO, `groups = StepN.class`.
  - `POST /api/wizard/drafts/{id}/steps/{step}/validate` uruchamia `@Validated(StepN.class)` plus walidatory biznesowe kroku.
  - Submit waliduje wszystkie grupy, czyli te same reguły bez duplikacji.
- **Wspólny format błędów:** `ProblemDetail` z `errors: [{ path, code, params }]`. Błędy z usług zewnętrznych mapowane na te same kody, nie przepuszczane jako surowe teksty z SOAP.

---

## Faza 4: Fundament UI

### 4.0 Katalog kontrolek: typ danych → jedna kontrolka (`docs/wizard/controls.md`)

**Twarda reguła:** o kontrolce decyduje typ semantyczny pola, nie autor kroku. Proponowany katalog (do dostosowania po inwentaryzacji):

| typ semantyczny | kiedy | kontrolka | uwagi |
|---|---|---|---|
| `yes-no` | wymagana odpowiedź tak/nie | `app-yes-no` (radio Tak/Nie, bez domyślnej) | wymusza świadomy wybór; nie checkbox |
| `flag` | opcjonalna flaga, domyślnie „nie” | `app-checkbox` | |
| `consent` | zgoda / oświadczenie | `app-consent` (checkbox + pełna treść / link) | wymagalność = musi być zaznaczone |
| `enum-small` | 2–4 opcje, jeden wybór | `app-radio-group` | wszystkie opcje widoczne od razu |
| `enum` | 5–15 opcji, statyczne | `app-select` | |
| `dict` | słownik z backendu | `app-dict-select dictionary="KOD"` | sam wybiera select (≤15) albo autocomplete z wyszukiwaniem (>15); jeden `DictionaryService` z cache |
| `multi-small` | wielokrotny wybór ≤6 | `app-checkbox-group` | |
| `multi` | wielokrotny wybór >6 / słownik | `app-multi-select` (chipsy) | |
| `text` | krótki tekst | `app-text-field` | szerokość wg oczekiwanej długości |
| `text-long` | opis, uzasadnienie | `app-textarea` | z licznikiem |
| `nip` / `pesel` / `regon` / `iban` / `postcode` | identyfikatory | `app-id-field type="…"` | maska + walidator sumy kontrolnej; wspólna implementacja |
| `amount` | kwota | `app-amount-field currency="PLN"` | format PL, wyrównanie do prawej, bez spinnera |
| `number` | liczba / ilość | `app-number-field` | min/max z inventory |
| `date` / `date-range` | data | `app-date-field` / `app-date-range` | wpisywanie DD.MM.RRRR + picker |
| `email` / `phone` | kontakt | `app-text-field type="email"` / `"tel"` | |
| `address` | adres | `app-address` (komponent złożony) | jeden układ w całej aplikacji |
| `file` | załącznik | `app-file-upload` | limity typów/rozmiaru z backendu |
| `readonly` | dane z prefill / usługi zewn. | `app-readonly-field` | tekst, nie disabled input |

**Reguły zachowania** (też w `controls.md`):

- **Ukryte vs disabled.** Pole nieaplikowalne → ukryte. Disabled tylko gdy chwilowo zablokowane, i wtedy z wyjaśnieniem w hincie.
- **Label nad polem, hint pod polem, błąd zastępuje hint.** Oznaczamy pola opcjonalne „(opcjonalne)”, a nie wymagane gwiazdką, bo większość pól jest wymagana.
- **Jedna kolumna domyślnie.** Krótkie pola (kod pocztowy, data) węższe, ale w jednej linii tylko pola powiązane (np. kod + miasto).
- **Sekcje z nagłówkiem**, ok. ≤7 pól na sekcję. Dłuższy krok to sygnał do podziału.
- **Błąd pokazujemy po blur albo po „Dalej”**, nigdy w trakcie pisania. Po „Dalej” focus przechodzi na pierwsze błędne pole.

**Egzekwowanie** (żeby ani ludzie, ani Sonnet nie dryfowali):

- w `steps/` dozwolone wyłącznie komponenty `app-*` z katalogu (lint z Fazy 4.8);
- `scripts/check-controls.ts` porównuje kolumnę „kontrolka docelowa” z inventory z tym, co faktycznie jest w szablonach kroków, i wypisuje rozbieżności. Wchodzi do `verify-step.sh`;
- trasy `localhost:4200/mock/<nazwa-kontrolki>` (Faza 4.0a) pokazują każdą kontrolkę z katalogu we wszystkich stanach (pusty, wypełniony, błąd, disabled, readonly) na zmockowanych danych. To wizualne źródło prawdy.

### 4.0a Podgląd kontrolek na mockach: `localhost:4200/mock/<nazwa-kontrolki>`

Każda kontrolka z katalogu ma własną trasę w Angularze, odpalaną na zmockowanych danych, np.:

| URL | kontrolka |
|---|---|
| `/mock` | indeks: lista wszystkich kontrolek z linkami |
| `/mock/address` | `app-address` |
| `/mock/id-field` | `app-id-field` (wszystkie typy: `nip`, `pesel`, `regon`, `iban`, `postcode`) |
| `/mock/dict-select` | `app-dict-select` (wariant select ≤15 i autocomplete >15) |
| `/mock/amount-field` | `app-amount-field` |
| `/mock/yes-no` | `app-yes-no` |
| … | jedna trasa per wiersz katalogu z 4.0 |

**Zasady:**

- **Nazwa w URL = nazwa komponentu bez prefiksu `app-`** (`app-address` → `/mock/address`). Bez wyjątków, żeby trasę dało się wyliczyć z katalogu.
- **Strona kontrolki pokazuje:**
  - wszystkie stany obok siebie: pusty, wypełniony, błąd, disabled, readonly (plus warianty, np. typy `app-id-field`);
  - podgląd bieżącej wartości formularza (JSON) i błędów walidacji, żeby było widać, co kontrolka faktycznie oddaje;
  - przełącznik stanu przez query param, np. `/mock/address?state=error`, żeby dało się linkować konkretny stan (do feedbacku, zgłoszeń, e2e).
- **Dane mockowe:**
  - wartości przykładowe z fixture'ów w repo: `frontend/.../dev/mock-controls/fixtures/<nazwa>.json`;
  - kontrolki zależne od backendu (`dict-select`, prefill w `address`, `readonly`) wołają prawdziwe `/api/**` przez proxy, a backend na profilu `mock` odpowiada z WireMocka (2a). Dzięki temu na `/mock/*` widać też zachowanie przy odrzuceniu / błędzie technicznym (magiczne wartości z `docs/wizard/test-data.md`).
- **Tylko dev:** trasa `/mock` lazy-loaded i dołączana tylko gdy `environment.devTools` (lub osobna konfiguracja builda); w buildzie prod jej nie ma (sprawdzane testem, patrz Weryfikacja).
- **Użycie w testach:** Playwright `toHaveScreenshot()` + axe-core per `/mock/<nazwa>?state=…` — regresja wizualna i a11y każdej kontrolki osobno, niezależnie od kroków wizarda.
- **Feedback:** uwagi do `docs/wizard/feedback/controls.md` linkują do `/mock/<nazwa>?state=…`, więc każda uwaga do wyglądu kontrolki jest od razu reprodukowalna.

### 4.1+ Infrastruktura

1. **Jedna biblioteka komponentów** (ta, która dominuje: Material albo PrimeNG). Wrappery `app-*` z katalogu ją opakowują.
2. **Wrappery pól** (`ControlValueAccessor`): `app-text-field`, `app-select`, `app-date-field`, `app-amount-field`, `app-checkbox`. Każdy ma identyczny układ: label, wymagalność, hint, błąd.
3. **Jedno mapowanie `code` → komunikat** (i18n) dla błędów Angulara i kodów z backendu. Błędy serwera trafiają do pól przez `path`.
4. **`WizardShellComponent`**: stepper, stopka Wstecz/Dalej, podsumowanie błędów, spinner walidacji. Kroki nie mają własnej nawigacji.
5. **`WizardStore`** (signals / NgRx SignalStore) trzyma `WizardDraft` i synchronizuje go z draftem serwerowym (2b).
6. **Kontrakt kroku:** `{ id, form (typed reactive forms), toDraft(), fromDraft(), validateRemote }`. `fromDraft` umożliwia seedowanie.
7. **Krok „Podsumowanie”** z linkami „edytuj”.
8. **ESLint/template lint:** zakaz surowych `<input>`, `mat-form-field` itp. w `steps/`.

---

## Faza 5: Migracja „strangler”

- Nowy shell obok starego, każdy krok to osobny PR.
- Pierwszy krok przepisany starannie jako **implementacja referencyjna**.
- Kolejne kroki to małe zadania dla LLM ze stałym szablonem:

  > „Przepisz krok X wg `inventory.md` (wiersze kroku X), na wzór `steps/step-1/`, tylko `app-*` fieldy, `WizardStore`, `/steps/X/validate`. Dodaj scenariusz `scenarios/krok-X-*.json`. Nie ruszaj innych kroków.”

- **Weryfikacja kroku:** załaduj scenariusz → sprawdź krok → e2e plus porównanie zrzutów.

---

## Faza 6: Dokumentacja dla agentów

`AGENTS.md` w tamtym repo zawiera:

- inventory, wzorzec kroku, wrappery, format błędów;
- jak uruchomić z mockami i załadować scenariusz (`scripts/run-mock.sh` → `localhost:4200/wizard?scenario=…`, kontrolki pod `localhost:4200/mock/<nazwa>`);
- listę magicznych wartości testowych.

Opcjonalnie skille `scaffold-wizard-step` i `load-wizard-scenario`.

---

## Wykonanie tanio tokenowo (Sonnet na innym komputerze)

> **Zasada:** myślenie robi się raz (tu / Opus), Sonnet tylko wykonuje gotowe, wąskie zadania i nigdy nie eksploruje repo sam.

### 1. Zadania jako pliki, jedna świeża sesja na zadanie

`docs/wizard/tasks/NN-nazwa.md`, stały szablon:

- **Cel** (1–2 zdania);
- **Czytaj tylko:** dokładne ścieżki (wzorzec, wiersze inventory);
- **Wolno zmieniać:** dokładne ścieżki / katalog;
- **Nie ruszaj:** …;
- **Done:** jedna komenda, np. `./scripts/verify-step.sh 3`, która ma się skończyć `PASS`.

Prompt dla Sonneta jest wtedy jednolinijkowy: `Wykonaj docs/wizard/tasks/07-krok-3.md`.

- Nowa sesja albo `/clear` między zadaniami. Długa sesja co turę płaci za całą historię.
- Zadania rozpisuje tu Opus, raz, po inwentaryzacji.

### 2. Krótki, precyzyjny CLAUDE.md

- Maksymalnie ~60–80 linii: komendy build/test, mapa katalogów wizarda, link do wzorca, zakazy.
- Szczegóły trzymać w osobnych plikach docs, czytanych tylko wtedy, gdy zadanie je wskaże. `CLAUDE.md` jest ładowany w każdej turze.

### 3. Weryfikacja przez skrypty, nie przez oczy modelu

- `scripts/verify-step.sh N` = lint + unit + e2e scenariusza kroku N. Wypisuje tylko `PASS` albo listę błędów (Playwright `--reporter=line`, `ng test --watch=false` z cichym reporterem, `gradlew -q`).
- Bez screenshotów w kontekście modelu, bo obrazy są najdroższe. Wizualną regresję robi Playwright `toHaveScreenshot()`: piksele porównuje narzędzie, model widzi tylko diff > próg.
- Bez MCP przeglądarki do weryfikacji. Playwright z CLI wystarcza.

### 4. Inwentaryzacja w miarę możliwości skryptem, nie czytaniem

- **Pola formularzy:** skrypt ts-morph wyciąga `FormControl`/`Validators` z komponentów kroków.
- **Walidacje BE:** grep/skrypt po adnotacjach `jakarta.validation` w DTO.
- **Wywołania zewnętrzne:** grep po klientach SOAP/REST.
- LLM dostaje gotowe tabelki i tylko je uzupełnia o reguły biznesowe, zamiast czytać cały kod.

### 5. Ograniczyć to, co model w ogóle widzi

- `.claude/settings.json` → `permissions.deny` dla `Read(**/node_modules/**)`, `Read(**/dist/**)`, `Read(**/build/**)`, `Read(**/*.min.js)`, wygenerowanych klas z WSDL itp.
- Wyłączyć w tamtej sesji MCP-y, które nie są potrzebne. Definicje narzędzi to tokeny w każdej turze.
- Wygenerowany kod (klienci SOAP z WSDL, OpenAPI) trzymać poza ścieżkami, które model przeszukuje.

### 6. Wzorzec ponad opis

- Jeden wzorcowy krok (`steps/step-1/`) zastępuje strony instrukcji. Sonnet kopiuje strukturę zamiast ją wymyślać, więc mniej iteracji i mniej poprawek.
- Ewentualny skill `scaffold-wizard-step` generuje szkielet kroku (pliki plus test plus scenariusz) z szablonu.

### 7. Model pod zadanie

| Model | Zadania |
|---|---|
| **Opus** (tu) | inwentaryzacja reguł biznesowych, decyzje, rozpisanie zadań, implementacja referencyjna |
| **Sonnet** | migracja kolejnych kroków wg zadań |
| **Haiku** | czysto mechaniczne rzeczy (uzupełnianie tabel, scenariusze JSON wg szablonu, poprawki lint) |

---

## Automatyczny review: trzy warstwy, od najtańszej

> **Zasada:** wszystko, co da się sprawdzić skryptem, sprawdza skrypt (0 tokenów). LLM reviewuje tylko to, czego skrypt nie umie ocenić, i tylko diff.

### Warstwa 1: deterministyczne checki

`scripts/checks/`, jedna komenda `npm run check:wizard`. Każdy check wypisuje tylko rozbieżności, a gdy ich nie ma, `OK`.

- **`check-controls`**: kontrolki w szablonach kroków vs kolumna „kontrolka docelowa” w inventory.
- **`lint`**: zakaz surowych `<input>`/`mat-*`/`p-*` w `steps/`, zakaz `any` w formularzach, zakaz `sessionStorage` w wizardzie.
- **`check-error-codes`**: każdy kod błędu z backendu (enum / stałe) ma komunikat w i18n, i odwrotnie (martwe klucze).
- **`check-coverage`**: każdy krok ma co najmniej jeden scenariusz w `scenarios/` i e2e, które go używa. Każdy scenariusz da się załadować (smoke). Każda kontrolka z katalogu ma trasę `/mock/<nazwa>` z fixture'em i test screenshot, i odwrotnie (martwe trasy).
- **`check-inventory`**: każde pole w `WizardDraft` występuje w inventory, i odwrotnie.
- **`check-feedback`**: liczba uwag `open` / `accepted`-nie-`done` per krok; ostrzeżenie, gdy krok jest oznaczony jako zmigrowany, a ma `accepted`.
- **`check-api-docs`**: każdy endpoint kontrolerów wizarda (z `/v3/api-docs` springdoc) ma folder w `docs/wizard/api/` z kompletem plików, i odwrotnie (martwe foldery).
- **`run-api-examples.sh`**: odpala wszystkie curle „nasz serwis” na profilu `mock` i porównuje odpowiedzi z `our-response.json` (ignorując pola zmienne: id, timestampy). Wypisuje tylko różnice.
- **Golden testy mapperów** z 2c (część zwykłego `gradlew test`).
- **axe-core** (`@axe-core/playwright`) w e2e każdego scenariusza: brak powiązanych labeli, kontrast, focus. To wyłapuje sporo „dziwnego UI” za darmo.
- **Playwright `toHaveScreenshot()`** per scenariusz. Raport HTML z diffami ogląda człowiek, nie model.
- **Backend, ArchUnit:** klienci SOAP/REST tylko w `adapter/out`, `DevScenarioController` tylko z `@Profile("dev|mock")`, DTO kroków mają przypisane grupy walidacji.

Odpalane w pre-commit (szybkie) i w CI (całość).

### Warstwa 2: hooki Claude Code (`.claude/settings.json` w tamtym repo)

- **`PostToolUse`** na `Edit|Write` w `steps/**` uruchamia lint + `check-controls` tylko dla zmienionego pliku. Zwraca wyłącznie błędy, więc model poprawia od razu, a nie po 10 plikach.
- **`Stop` hook** uruchamia `verify-step.sh` dla kroku, którego dotyczyła zmiana. Przy `FAIL` blokuje zakończenie i zwraca listę błędów. Sonnet nie może ogłosić „gotowe”, dopóki checki nie przechodzą.
- Output hooków ucięty do ~30 linii, żeby nie zjadać kontekstu.

### Warstwa 3: LLM review tylko tego, czego skrypt nie oceni

Subagent `.claude/agents/wizard-reviewer.md` (model: sonnet albo haiku; narzędzia tylko Read/Grep/Bash):

- **wejście:** `git diff` plus `docs/wizard/controls.md` plus checklista UX;
- nie czyta reszty repo;
- **checklista:** kolejność pól i sekcji ma sens, treść labeli/hintów/komunikatów (język, spójność terminologii ze słowniczkiem), czy błąd biznesowy pojawia się na właściwym kroku, czy pole nie powinno być prefillowane / ukryte warunkowo;
- **stały format wyjścia:** maks. 10 uwag, `plik:linia — problem — propozycja`, bez pochwał i streszczeń.
- Działa w osobnym kontekście, więc nie zaśmieca głównej sesji.

Dodatkowo:

- Wbudowany `/code-review` na diff jako dodatkowy przegląd poprawności (bugi, a nie UX).
- Opcjonalnie: ten sam reviewer w CI na każdym MR (Claude Code w pipeline), komentujący MR.

---

## Skille w tamtym repo (`.claude/skills/`)

Krótkie, proceduralne, wskazujące pliki zamiast je cytować:

| Skill | Co robi |
|---|---|
| `wizard-feedback` | uruchom `gen-feedback.ts` (addytywnie); w trybie triażu zbierz `open` → zaproponuj decyzje → wygeneruj taski |
| `wizard-migrate-step` | przeczytaj task → wzorzec `steps/step-1/` → wiersze inventory → `accepted` uwagi z `feedback/step-NN.md` → implementuj → oznacz uwagi `done` → `verify-step.sh` → raport w 3 linijkach |
| `wizard-scenario` | utwórz albo zaktualizuj scenariusz JSON z opisu („firma, krok 5, KYC odrzucone”) przy użyciu buildera i listy magicznych wartości |
| `wizard-inventory` | uruchom skrypty ekstrakcji i uzupełnij w tabeli tylko kolumny wymagające rozumienia (typ semantyczny, reguły biznesowe) |
| `wizard-review` | najpierw `npm run check:wizard`; dopiero gdy OK, odpal subagenta `wizard-reviewer` na diffie |
| `wizard-api-doc` | z `captures/` (albo z kontrolera + mappera) utwórz / zaktualizuj folder `docs/wizard/api/<wywołanie>/` wg szablonu, dopisz stub WireMock i golden test mappera, uruchom `run-api-examples.sh` |
| `wizard-run-mock` | `scripts/run-mock.sh`: backend na profilu `mock` z WireMockiem + front z proxy pod `localhost:4200`; podaj URL wskazanego scenariusza (`/wizard?scenario=…`) albo kontrolki (`/mock/<nazwa>`) do ręcznego testu |

**Efekt:** typowe zadanie dla Sonneta to `/wizard-migrate-step 07`. Ten skill sam kończy się checkami (hook), a potem `/wizard-review`.

---

## Kluczowe artefakty (w tamtym repo)

- `docs/wizard/inventory.md`, `docs/wizard/test-data.md`
- `docs/wizard/feedback/` (flow, kontrolki, per krok) plus `scripts/gen-feedback.ts`
- `docs/wizard/api/<wywołanie>/`: curle, przykłady, mapowania (katalog wywołań)
- interceptor/filtr nagrywający (profil `dev`/`mock`) → `captures/`
- `mocks/wiremock/` (stuby wskazujące na przykłady z `docs/wizard/api/`) plus serwis w docker-compose / profil `mock`
- `scenarios/*.json`, `DevScenarioController` (tylko profil `dev`/`mock`)
- `frontend/.../wizard/shell/` (`WizardShellComponent`, `WizardStore`, kontrakt kroku), `frontend/.../dev-panel/`
- `frontend/.../shared/form-fields/` (wrappery plus `ErrorMessageService`)
- `frontend/.../dev/mock-controls/` (trasy `/mock/<nazwa>`, fixture'y kontrolek), `proxy.conf.json`, `scripts/run-mock.sh`
- `backend/.../wizard/`: grupy `StepN`, endpoint walidacji kroku, draft, wspólny format błędów

---

## Weryfikacja

- [ ] Dowolny scenariusz z `scenarios/` ładuje się w < 5 s i otwiera właściwy krok z danymi.
- [ ] „Eksportuj stan” → „Załaduj” daje identyczny stan (test round-trip).
- [ ] Każdy wariant odpowiedzi usług zewn. (OK / odrzucenie / błąd techniczny) jest osiągalny przez magiczną wartość i widoczny na właściwym kroku.
- [ ] Błąd biznesowy z kroku N pojawia się na kroku N, a nie przy submit.
- [ ] e2e startujące od scenariuszy przechodzą po każdym kroku migracji.
- [ ] Lint: zero surowych kontrolek w `steps/`.
- [ ] Endpointy `/dev/**` niedostępne na profilu prod (test).
- [ ] `scripts/run-mock.sh` stawia całość jedną komendą; wizard i kontrolki działają pod `localhost:4200`.
- [ ] Każda kontrolka z katalogu otwiera się pod `localhost:4200/mock/<nazwa>` (np. `/mock/address`) we wszystkich stanach, na zmockowanych danych.
- [ ] Trasy `/mock/**` nie istnieją w buildzie prod (test).

---

## Pierwszy krok wykonania

Podpiąć tamto repo do sesji, a potem kolejno:

1. **Faza 0** — siatka bezpieczeństwa.
2. **Faza 1** — inwentaryzacja, w tym lista wywołań SOAP/REST.
3. **Faza 1b** — wygenerowanie struktury feedbacku, żebyś mógł od razu wpisywać uwagi.
4. **Faza 2c** — tryb nagrywania + katalog wywołań.
5. **Faza 2a** — WireMock na tych samych przykładach.

To daje wartość od razu, jeszcze przed ruszaniem UI.
