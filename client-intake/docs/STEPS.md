# Katalog kroków (specyfikacja)

Jedna sekcja = jeden krok (`StepDef`). Jeden wiersz tabeli = jedno pole (`FieldDef`).
**Przy migracji uzupełnij ten plik pierwszy** (docs/MIGRATION.md, krok 1) — jest wejściem dla Copilota.
Szablon wiersza: `templates/steps-row.template.md`.

Legenda kolumn:
- **id** — ścieżka w modelu (`Customer`), klucz dla błędów walidacji,
- **wejście → wyjście** — co trafia do command line i jak zapisuje się w modelu (`—` = domyślnie `model[id]`),
- **walidacja** — błąd formatu typu + `V.*`,
- **słownik / compute / suggest / visibleWhen** — zachowanie pola,
- **DTO** — pole w `ClientCardDto` (mapper),
- **błędy serwera** — kody z walidacji karty, które trafiają na to pole.

---

## Grupa: Dane podstawowe (`podstawowe`, kolor `--group-1`)

`onComplete`: wstępny zapis klienta — `ClientApi.savePreliminary(toPreliminaryDto(model), clientId)`.

### Krok 1 — `imie` (`steps/podstawowe.steps.ts`)

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `imie` (+`nazwisko`) | text | Imię i nazwisko / Imię i Nazwisko | `"{imie} {nazwisko}"` → 1. słowo = `imie`, reszta = `nazwisko` (wielka litera, też po myślniku) | `V.minWords(2)` „Podaj zarówno imię, jak i nazwisko (dwa słowa)." | — | `client.firstName`, `client.lastName` | (dowolny na tych ścieżkach) |

### Krok 2 — `telefon`

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `telefon` | phone | Numer telefonu / Telefon | `+48 601 234 567` → `601234567` | 9 cyfr (akceptuje spacje, +48) | — | `client.phone` (E.164) | — |

### Krok 3 — `email`

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `email` | email | Adres e-mail / Adres E-mail | — (trim + małe litery) | format e-mail | — | `client.email` | `EMAIL_TEST_DOMAIN` (mock) |

## Grupa: Adresy (`adresy`, kolor `--group-2`)

### Krok 4 — `adres_klienta` (`steps/adresy.steps.ts`)

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `adres_klienta` | address | Adres klienta / Adres Klienta | — | `V.addressPL()` | ghost: `ul. Nazwa Ulicy, Miejscowość, 00-000` | `client.address` | `ZIP_CITY_MISMATCH` (mock) |

### Krok 5 — `adres_wysylki`

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `wysylka_same` | boolean | Adres wysyłki / (brak w arkuszu) | `tak/nie` → `true/false`; „tak" kopiuje adres klienta | tak/t/nie/n | preselect „Tak"; `progress: false` | `shipping.sameAsClient` | — |
| `adres_wysylki` | address | Adres wysyłki / Adres Wysyłki | — ; arkusz: `"{adres} (taki sam)"` | `V.addressPL()` | **compute**: = `adres_klienta` gdy `wysylka_same` (wtedy niepytane); `editTarget` → `wysylka_same` | `shipping.address` | `ZIP_CITY_MISMATCH` (mock) |

## Grupa: Osoby polecające (`polecajacy`, kolor `--group-3`)

### Krok 6 — `polecajacy` (kolekcja, `steps/polecajacy.step.ts`)

Kod wyszukiwania: `^#\d{3,6}$` („Kod w formacie #NNNN, np. #1234."). `load`: `ClientApi.searchReferrals(code)`
→ `fromReferralCandidateDto`. Lista: imię i nazwisko · miasto · ostatni kontakt. Wybór: ✕ / ↩, `-N` / `+N`.
Enter z tym samym kodem lub ⌘Enter = „Zatwierdź wszystkie". Wynik: `model.polecajacy: Person[]`.
Do % całości się nie liczy (`countInTotal: false`), do % grupy — tak.

Pytania o każdą osobę (`person.schema.ts`, model = `Person`):

| id | typ | label | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `znam` | select | Skąd znasz | etykieta → kod słownika lub wpisany tekst | wymagane: „Podaj, skąd znasz tę osobę (np. Znajomy)." | słownik `relacje`, `allowCustom`, preselect | `referrals[i].relation` | — |
| `telefon` | phone | Telefon | prefill z wyszukiwania | 9 cyfr | — | `referrals[i].phone` | `REFERRAL_PHONE_IS_CLIENT`, `REFERRAL_PHONE_DUPLICATE` (mock) |

## Grupa: Dane dodatkowe — DEMO (`dodatkowe`, `--group-4`, tylko `?demo=1`)

Wzorce pól, których nie ma w mockupie (`steps/dodatkowe.steps.ts`).

| id | typ | label | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `data_urodzenia` | date | Data urodzenia | `DD.MM.RRRR` → ISO | `notFuture`, `notBefore(1900)`, `minAge(18)` | ghost: maska `DD.MM.RRRR` | `client.birthDate` | — |
| `wiek` | number | Wiek | arkusz: „62 lata" | — | **compute** z daty (nigdy niepytane), `editTarget` → `data_urodzenia` | — | — |
| `wojewodztwo` | select | Województwo | etykieta → kod | z listy | słownik `wojewodztwa`, `preselect: false`, **suggest** z kodu pocztowego | `client.voivodeship` | — |
| `zrodlo` | select | Źródło pozyskania | etykieta → kod | opcjonalne | słownik `zrodla` (backend), **suggest** „Polecenie" gdy są osoby polecające | `client.acquisitionSource` | — |

## Błędy ogólne (bez pola)

| kod | znaczenie |
|---|---|
| `CLIENT_NOT_SAVED` (mock) | walidacja bez wstępnego zapisu |
