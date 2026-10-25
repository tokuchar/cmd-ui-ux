# client-intake — Zakładanie klienta (Asystent Operatora)

Angular 22 (standalone, signals, zoneless) + Tailwind v4. Przepisanie 1:1 mockupu
[`../mockup/zak_adanie_klienta.html`](../mockup/zak_adanie_klienta.html) — styl **command line** —
jako baza migracji istniejącej aplikacji-kreatora.

## Start

```bash
npm install
npm start            # http://localhost:4200
```

- `http://localhost:4200/?demo=1` — dodatkowy krok z typami pól docelowej aplikacji (data, pole wyliczane, słownik z backendu, podpowiedź).
- W command line: `fake all` wypełnia dane, ⌘K tryb komend (`podsumowanie`, `waliduj`, `popraw`, `od nowa`), ⌘J „Dane klienta", ⌘Q motyw.
- Kod polecający testowy: `#1234`. Błąd walidacji karty wywołasz np. e-mailem `@example.pl`.

```bash
npx ng test --watch=false
npm run build
```

Zalecany Node LTS 22.22+ / 24.15+.

## Struktura

```
src/
  styles/tokens.css          ← WSZYSTKIE kolory (jasny + ciemny)
  styles.css                 ← tokeny → klasy Tailwinda
  app/core/
    config/                  ← kroki, grupy, słowniki, pola osób, komendy, dane DEV
      steps/*.ts             ← 1 plik = 1 krok (deklaracje FieldDef)
      flow.config.ts         ← kolejność + zapis wstępny + walidacja karty
    engine/                  ← generyczny silnik (FieldDef/StepDef, typy pól, przepływ, IntakeEngine)
    validation/validators.ts ← walidatory V.*
    models/                  ← model domenowy (Customer, Person)
    api/                     ← ClientApi (interfejs), DTO, MockClientApi  ← SZEW MIGRACJI
    mappers/                 ← model ↔ DTO, błędy walidacji → pola
    state/intake.store.ts    ← stan (signals)
    services/                ← słowniki, motyw, toasty
  app/features/intake/       ← komponenty UI (command line, karta osób, pipeline, arkusz, toasty)
docs/                        ← dokumentacja migracji (start: MIGRATION.md)
.github/copilot-instructions.md
```

## Dokumentacja

| Plik | Treść |
|---|---|
| [docs/MIGRATION.md](docs/MIGRATION.md) | playbook migracji krok po kroku + mapa mockup → Angular |
| [docs/STEPS.md](docs/STEPS.md) | katalog kroków i pól (wejście/wyjście, walidacje, DTO, błędy serwera) |
| [docs/DATA-FLOW.md](docs/DATA-FLOW.md) | przepływ danych, mappery, przykłady DTO |
| [docs/FIELD-TYPES.md](docs/FIELD-TYPES.md) | typy pól, opcje FieldDef, walidatory, przepisy |
| [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | założenia, różnice względem mockupu, otwarte pytania |
| [docs/THEMING.md](docs/THEMING.md) | tokeny kolorów, przemalowanie pod markę |
| [docs/templates/](docs/templates) | szablony kroku, pola, mappera, walidatora, wiersza STEPS.md |
