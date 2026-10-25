# Instrukcje dla Copilota — client-intake

Aplikacja: „asystent operatora" do zakładania klienta w stylu **command line** (Angular 22,
standalone, signals, zoneless, Tailwind v4). Jest bazą migracji aplikacji-kreatora na ten styl.
Wzorzec wizualny 1:1: `../mockup/zak_adanie_klienta.html`.

Zanim zaczniesz zadanie migracyjne, przeczytaj: `docs/MIGRATION.md` (playbook),
`docs/STEPS.md` (specyfikacja kroków), `docs/FIELD-TYPES.md`, `docs/DATA-FLOW.md`.

## Gdzie co jest

| Co | Gdzie |
|---|---|
| Kolory (jedyne źródło) | `src/styles/tokens.css` → mapowanie na klasy w `src/styles.css` (`@theme inline`) |
| Kroki przepływu (1 plik = 1 krok) | `src/app/core/config/steps/*.step(s).ts`, kolejność: `core/config/flow.config.ts` (`STEPS`, `GROUPS`) |
| Słowniki pól wyboru | `core/config/dictionaries.config.ts` (lokalne) + `ClientApi.getDictionaries()` (backend) |
| Pola osoby z kolekcji | `core/config/person.schema.ts` |
| Walidatory | `core/validation/validators.ts` (`V.*`) |
| Typy pól (parse/format/ghost) | `core/engine/field-types.ts` (`FIELD_TYPES`) |
| Model domenowy | `core/models/customer.model.ts` |
| DTO (kontrakt REST) | `core/api/api.models.ts` |
| Backend | interfejs `core/api/client-api.ts`, mock `core/api/mock-client-api.ts`, provider w `app.config.ts` |
| Mapowanie model ↔ DTO | `core/mappers/*.mapper.ts` |
| Ścieżki błędów walidacji → pola | `core/mappers/validation-error.mapper.ts` (`ISSUE_PATH_MAP`) |
| Silnik przepływu | `core/engine/intake-engine.ts` (generyczny — nie zna konkretnych pól) |
| Komponenty UI | `src/app/features/intake/*` |

## Zasady (MUSISZ)

1. **Kolory tylko z tokenów.** Żadnych hexów, `rgb()`, `bg-gray-*`, `text-rose-*` w komponentach.
   Brakuje koloru → dodaj token w `tokens.css` (`:root` i `.dark`) + linię `--color-…` w `styles.css`.
   Nie używaj wariantów `dark:` dla kolorów — tryb ciemny robią tokeny.
2. **Logika pól tylko w deklaracjach `FieldDef`/`StepDef`.** Nie dopisuj `if (field.id === …)` do silnika
   ani komponentów. Potrzebne nowe zachowanie → nowa opcja w `FieldDef` albo nowy typ w `FIELD_TYPES`.
3. **DTO tylko w mapperach i `core/api`.** Komponenty, silnik i konfiguracja kroków operują na modelu domenowym.
   Wyjątek: `load` kolekcji i `onComplete` grupy wołają API przez `HookContext` + mapper.
4. **Id pola = ścieżka w modelu** (`email`, `adres.kod`, `polecajacy[1].telefon`). Ten sam klucz w
   `ISSUE_PATH_MAP`, arkuszu „Dane klienta" i nawigacji poprawek.
5. Komunikaty dla operatora **po polsku**, krótkie, z przykładem formatu. HTML w `hint` jest zaufany —
   dane użytkownika wstawiaj przez `escapeHtml()`.
6. Każda zmiana kroku → aktualizacja wiersza w `docs/STEPS.md`. Każdy nowy kod błędu z backendu →
   wpis w `ISSUE_PATH_MAP` + kolumna „Błędy serwera" w `docs/STEPS.md`.
7. Komponenty: standalone, `ChangeDetectionStrategy.OnPush`, signals, nowa składnia `@if/@for`.
   Pliki bez sufiksu `.component` (konwencja Angular 22: `command-line.ts`, klasa `CommandLine`).
8. Testy: czyste funkcje (typy pól, walidatory, mappery, reguły przepływu) mają testy Vitest obok pliku (`*.spec.ts`).

## Szablony

`docs/templates/` — kopiuj zamiast pisać od zera: `step.template.ts`, `field.template.ts`,
`mapper.template.ts`, `validator.template.ts`, `steps-row.template.md`.

## Komendy

```bash
npm start                 # ng serve, http://localhost:4200 (?demo=1 = krok demonstracyjny)
npm run build
npx ng test --watch=false
```
