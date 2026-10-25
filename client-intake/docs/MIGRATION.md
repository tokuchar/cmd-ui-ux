# Playbook migracji: kreator/formularz → command line

Cel: przenieść istniejącą aplikację Angular (klasyczny wizard/formularz zakładania klienta) na ten
szablon, **zachowując styl command line 1:1** i maksymalnie szybko. Zasada: zmieniamy **konfigurację,
model, DTO i mappery** — silnik (`core/engine`) i komponenty (`features/intake`) zostają bez zmian.

Każdy krok poniżej jest samodzielnym zadaniem (dobrym na jedno polecenie dla Copilota) i kończy się
checklistą. Kolejność ma znaczenie.

```
0. Przygotowanie ─► 1. Inwentaryzacja ─► 2. Model ─► 3. Słowniki ─► 4. Kroki ─► 5. API + DTO + mappery
                                                                                       │
                     8. Kolory ◄─ 7. Weryfikacja ◄─ 6. Walidacja karty (błędy → pola) ◄┘
```

---

## 0. Przygotowanie

- Node **22.22+ lub 24.15+ (LTS)**. Na Node 23 Angular 22 działa, ale wypisuje ostrzeżenie.
- `npm install` (plik `.npmrc` ma `legacy-peer-deps=true` — obejście błędu npm 10.9 przy rozwiązywaniu peer deps).
- `npm start` → przejdź cały flow (`fake all` w command line wypełnia dane), żeby znać zachowanie bazowe.

## 1. Inwentaryzacja starej aplikacji

Dla każdego ekranu/sekcji starego kreatora wypisz pola do tabeli w `docs/STEPS.md`
(szablon wiersza: `docs/templates/steps-row.template.md`). **To jest specyfikacja dla kolejnych kroków.**

Z każdego pola starego formularza zbierz:

| Skąd w starej apce | Kolumna w STEPS.md |
|---|---|
| `formControlName` / nazwa pola w modelu | **id** (ścieżka w nowym modelu) |
| typ kontrolki (input, datepicker, select, checkbox, autocomplete) | **typ** (patrz tabela niżej) |
| `Validators.*`, walidatory własne, komunikaty `mat-error` | **walidatory** |
| źródło opcji selecta (enum, endpoint słownika) | **słownik** |
| wartości wyliczane (`valueChanges` → `setValue`) | **compute** |
| podpowiedzi / autouzupełnianie / wartości domyślne | **suggest / default** |
| `*ngIf` / `disable()` zależne od innych pól | **visibleWhen** |
| pole w DTO wysyłanym do backendu | **DTO** |
| kody/ścieżki błędów z usługi walidacji | **błędy serwera** |

Mapowanie kontrolek na typy pól:

| Stara kontrolka | `FieldDef.type` | Uwagi |
|---|---|---|
| input tekst | `text` | |
| input telefon | `phone` | model trzyma 9 cyfr |
| input e-mail | `email` | |
| adres (kilka inputów) | `address` *lub* kilka pól `text` w jednym kroku | jeden wpis z ghost-text szybszy dla operatora |
| datepicker | `date` | model: ISO `RRRR-MM-DD` |
| input liczbowy | `number` | |
| mat-select / autocomplete | `select` + `dictionary` | długie listy: `preselect: false` |
| checkbox / radio tak-nie | `boolean` | |
| lista osób (tabela + dialog) | krok-kolekcja (`collection`) | wzorzec „Osoby polecające" |
| pole tylko do odczytu, liczone | dowolny typ + `compute`, `visibleWhen: () => false` | np. wiek |

**Checklista:** każdy ekran starej apki ma sekcję w `STEPS.md`; każde pole ma id, typ, walidatory i DTO.

## 2. Model domenowy

Plik: `src/app/core/models/customer.model.ts`.

- Dodaj pola nowej apki do `Customer` (i `Person` dla osób), uzupełnij `emptyCustomer()`.
- Konwencje: telefon = 9 cyfr, data = ISO, select = **kod** słownika (nie etykieta), tak/nie = `boolean | null`.
- Usuń pola demonstracyjne (`data_urodzenia`, `wiek`, `wojewodztwo`, `zrodlo`), jeśli niepotrzebne,
  razem z `config/steps/dodatkowe.steps.ts` i presetem `dod` w `fake-data.config.ts`.

**Checklista:** `npm run build` przechodzi; brak `any` w modelu.

## 3. Słowniki

Plik: `src/app/core/config/dictionaries.config.ts` + `ClientApi.getDictionaries()`.

- Każdy słownik = klucz + lista `{ value, label, aliases? }` w kolejności prawdopodobieństwa.
- Słowniki z backendu: dopasuj `fromDictionaryDtos` (`core/mappers/dictionary.mapper.ts`) do kształtu
  odpowiedzi — sortowanie po wadze daje „najbardziej prawdopodobne" na górze.
- Lokalna wersja słownika zostaje jako fallback (aplikacja działa zanim przyjdzie odpowiedź).
- Aliasy = skróty operatora (np. `www` → „Strona internetowa"). Dodawaj je — przyspieszają wpisywanie.

**Checklista:** każdy `select` w STEPS.md ma klucz słownika; dropdown pokazuje pozycje w dobrej kolejności.

## 4. Kroki (konfiguracja przepływu)

Pliki: `src/app/core/config/steps/<grupa>.steps.ts`, rejestr `core/config/flow.config.ts`.
Szablony: `docs/templates/step.template.ts`, `docs/templates/field.template.ts`.

1. **Grupy** (`GROUPS` w `flow.config.ts`) = sekcje pipeline i „Dane klienta". Kolor: `var(--group-N)`
   (tokeny `--group-1…6` w `tokens.css`; potrzeba więcej → dodaj token).
2. **Krok** = „Krok N / M" w liczniku. Jeden krok może mieć kilka pól (pytane po kolei) — łącz pola,
   które operator wpisuje razem (np. „taki sam adres?" + adres).
3. **Pole** — wypełnij `FieldDef` wg wiersza STEPS.md. Wejście/wyjście:
   - domyślnie `model[id]` ⇄ command line — nic nie dopisujesz,
   - jedno pytanie → kilka pól modelu: `input` + `output` (przykład: „Imię i nazwisko" w `podstawowe.steps.ts`),
   - widok w arkuszu inny niż wpis: `display`,
   - dwuklik ma otworzyć inne pole: `editTarget`.
4. Kolejność kroków = kolejność w tablicy `STEPS`.
5. Teksty: `label` (nagłówek nad command line), `sheetLabel` (wiersz w arkuszu), `placeholder`
   (przykład wartości), `hint` (instrukcja + format, HTML).
6. Kolekcje osób: skopiuj `polecajacy.step.ts`; pytania o osobę w osobnej tablicy (jak `person.schema.ts`).
7. Dodaj preset `fake` dla nowych sekcji (`fake-data.config.ts` + `commands.config.ts`) — przyspiesza testy.

**Checklista per krok** (odhacz w STEPS.md):
- [ ] przejście Enterem z poprawną wartością,
- [ ] błędna wartość → czerwony komunikat po polsku, shake, pole nie przechodzi,
- [ ] powrót „‹ Wstecz" pokazuje zapisaną wartość,
- [ ] wiersz w „Dane klienta" ma etykietę, wartość i ✓,
- [ ] dwuklik w wiersz otwiera właściwe pole,
- [ ] warunki `visibleWhen`/`compute` działają w obie strony.

## 5. API, DTO i mappery

Pliki: `core/api/api.models.ts`, `core/api/client-api.ts`, `core/mappers/*`, `app.config.ts`.

1. **DTO**: podmień typy w `api.models.ts` na kontrakt prawdziwego backendu (najlepiej wygenerowane z OpenAPI).
2. **Interfejs** `ClientApi`: dostosuj sygnatury metod do endpointów (zapis wstępny, wyszukiwanie osób,
   słowniki, walidacja karty). Dodatkowe endpointy → nowe metody w interfejsie (i w mocku).
3. **Implementacja HTTP**: utwórz `core/api/http-client-api.ts`:

   ```ts
   @Injectable()
   export class HttpClientApi implements ClientApi {
     private readonly http = inject(HttpClient);
     private readonly base = '/api';
     getDictionaries() { return this.http.get<DictionaryDto[]>(`${this.base}/dictionaries`); }
     savePreliminary(dto: PreliminaryClientDto, clientId: string | null) {
       return clientId
         ? this.http.put<SavePreliminaryResponseDto>(`${this.base}/clients/${clientId}/preliminary`, dto)
         : this.http.post<SavePreliminaryResponseDto>(`${this.base}/clients/preliminary`, dto);
     }
     searchReferrals(code: string) {
       return this.http.get<ReferralCandidateDto[]>(`${this.base}/referrals`, { params: { code } });
     }
     validateCard(dto: ClientCardDto) {
       return this.http.post<CardValidationDto>(`${this.base}/clients/${dto.clientId}/card/validate`, dto);
     }
   }
   ```

   W `app.config.ts`: `provideHttpClient()` i `{ provide: CLIENT_API, useClass: HttpClientApi }`.
   Mock zostaw — przydaje się w testach i demo (np. przełącznik po `environment`).
4. **Mappery** (szablon `docs/templates/mapper.template.ts`): każde pole modelu, które idzie do backendu,
   ma linię w `toPreliminaryDto` / `toClientCardDto`; każde pole z wyszukiwania osób — w `fromReferralCandidateDto`.
   Konwersje formatów (telefon E.164, daty, kody słowników) tylko tutaj.
5. **Hooki**: wstępny zapis jest w `GROUPS[…].onComplete` (`flow.config.ts`) — przenieś go na grupę,
   po której backend przyjmuje zapis wstępny. Uruchamia się po każdej zmianie kompletnej grupy
   (tylko gdy dane się zmieniły) oraz przed walidacją karty.

**Checklista:** testy mapperów (`core/mappers/mappers.spec.ts`) pokrywają każde pole DTO;
podmiana providera nie wymaga zmian w komponentach.

## 6. Walidacja karty: błędy serwera → pola

Plik: `core/mappers/validation-error.mapper.ts`.

- Dla każdej ścieżki, którą zwraca usługa walidacji, dodaj wpis `{ api, field }` do `ISSUE_PATH_MAP`.
  Indeks listy zapisuj jako `[]` — jest przenoszony (`referrals[].phone` → `polecajacy[].telefon`).
- Jeśli backend zwraca kody pól zamiast ścieżek — dopasuj `mapIssuePath`.
- Błąd bez ścieżki (`path: null`) albo z nieznaną ścieżką → błąd ogólny (sekcja „Uwagi do karty").
- Ostrzeżenia (`severity: 'warning'`) obecnie traktowane jak błędy — jeśli mają nie blokować, odfiltruj
  je w `mapValidationIssues` lub dodaj osobną obsługę.

Zachowanie UI (bez zmian w kodzie): ekran „Do poprawy" z listą problemów → Enter prowadzi tylko po
błędnych polach (kolejność przepływu, wartość zaznaczona do nadpisania, komunikat serwera w echo) →
po ostatniej poprawce automatyczna ponowna walidacja.

**Checklista:** każdy kod błędu z dokumentacji backendu ma wpis w mapie i kolumnę w STEPS.md;
test w `mappers.spec.ts` dla ścieżek z indeksem.

## 7. Weryfikacja

```bash
npx ng test --watch=false   # czyste funkcje: typy, walidatory, przepływ, mappery
npm run build
npm start                   # ręcznie: pełny flow, błędy, poprawki, dwuklik, ⌘K, ⌘J, ⌘Q, tryb ciemny
```

- Scenariusz końcowy: wypełnij kartę → wymuś błąd walidacji serwera → popraw Enterem → karta „Zakończono".
- Porównaj z mockupem side-by-side (`../mockup/zak_adanie_klienta.html`) w trybie jasnym i ciemnym.

## 8. Kolory / marka

Patrz `docs/THEMING.md` — zmiana wartości w `src/styles/tokens.css`, nic więcej.

---

## Mapa: mockup HTML → Angular

| Mockup (`zak_adanie_klienta.html`) | Angular |
|---|---|
| `tailwind.config` (kolory) + `<style>` | `src/styles/tokens.css`, `src/styles/animations.css`, `src/styles.css` |
| `const steps = [...]` | `core/config/steps/*.ts` + `flow.config.ts` |
| `REL_OPTIONS` | słownik `relacje` (`dictionaries.config.ts`) |
| `REFERRAL_TEST`, losowe osoby | `MockClientApi.searchReferrals` |
| `FAKE`, `handleDevCommand` | `fake-data.config.ts`, `IntakeEngine.runFake` |
| `COMMANDS` | `commands.config.ts` |
| `validateEmail`, `validateAddressFormat`, telefon | typy pól (`field-types.ts`) + `V.addressPL()` |
| `buildAddrGhostTail` | `buildSegmentGhost` (typ `address`) |
| `customer`, `currentStep`, `referral*` (globalne `let`) | `IntakeStore` (signals) |
| `renderStep`, `submitStep`, `goBack`, `prefillValue` | `IntakeEngine.prompt`, `submit`, `back`, `fieldPrefill` |
| `startReferralQA`, `answerReferralQuestion`, `finishReferrals` | `IntakeEngine.approveAll`, `answerQueue`, `finishCollection` |
| `editFromPreview` | `IntakeEngine.editField` / `editItem` / `editCollection` |
| `groupStats`, `updateProgress` | `groupProgress`, `totalProgress` (`core/engine/flow.ts`) |
| `renderPipeline`, `PIPELINE_GROUPS` | `PipelineBar` + `GROUPS` |
| `#inputBlock`, `#echoResult`, dropdowny | `CommandLine` |
| `#referralCard` | `CollectionCard` |
| `#dataSheet` (bottom sheet) | `DataSheet` |
| `showToast` | `ToastService` + `ToastOutlet` |
| `toggleTheme` | `ThemeService` |
| skróty ⌘K/⌘F/⌘Q | `IntakePage.onKeydown` |

## Przykładowe polecenia dla Copilota

- „Na podstawie sekcji *Dane firmy* w `docs/STEPS.md` utwórz `src/app/core/config/steps/firma.steps.ts`
  wg `docs/templates/step.template.ts`, dodaj pola do `Customer` i grupę w `flow.config.ts`."
- „Dodaj do `toClientCardDto` mapowanie pól z sekcji *Dane firmy* (kolumna DTO w STEPS.md) i test w `mappers.spec.ts`."
- „Dodaj wpisy do `ISSUE_PATH_MAP` dla wszystkich kodów błędów z kolumny *Błędy serwera* w STEPS.md."
- „Utwórz `HttpClientApi` implementujący `ClientApi` wg sekcji 5 w `docs/MIGRATION.md`."
