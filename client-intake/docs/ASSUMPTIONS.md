# Założenia

## Cel i zakres

- Projekt jest **bazą redesignu** istniejącej aplikacji Angular (zakładanie klienta przez klasyczny
  kreator/formularz). Docelowa aplikacja przejmuje **styl i UX command line 1:1** z mockupu
  `mockup/zak_adanie_klienta.html`.
- Priorytet: **szybkość operatora** — klawiatura zamiast myszy, wartości podpowiadane i wstępnie wypełnione,
  natychmiastowa walidacja, minimalna liczba kroków przy poprawkach.

## Dane w docelowej aplikacji (różnice względem mockupu)

| Obszar | Mockup | Docelowo — jak to obsługujemy |
|---|---|---|
| Kroki | 6 | **więcej** — nowe pliki w `config/steps`, rejestr `flow.config.ts`; licznik i pipeline liczą się same |
| Pola | tekst, telefon, e-mail, adres, tak/nie | też **daty, liczby, listy wyboru, pola wyliczane i podpowiadane** — typy i opcje `FieldDef` |
| Słowniki | 6 pozycji, w kodzie | **większe, z backendu** — `ClientApi.getDictionaries()`, filtrowanie po wpisie, aliasy, wagi |
| Wyszukane osoby | imię, telefon | **więcej danych** (miasto, ostatni kontakt, …) — `fromReferralCandidateDto`, `itemDetail`, dodatkowe pytania w `person.schema.ts` |
| Walidacje | proste, w przeglądarce | **różne** — biblioteka `V.*`, walidatory async, **walidacja całej karty w usłudze** |
| Ilość danych | mała | **większa i trochę inna** — model, DTO i mappery są rozdzielone; silnik generyczny |

## Przepływ biznesowy (jak w obecnej aplikacji)

1. **Wstępny zapis klienta (REST)** — po skompletowaniu grupy „Dane podstawowe" (`GroupDef.onComplete`).
   Kolejne zmiany tej grupy = aktualizacja z tym samym `clientId`. Zapis jest nieblokujący (toast);
   walidacja karty czeka na zaległe zapisy.
2. **Zbieranie danych osób** — kolekcja: kod → wyszukanie → wybór → pytania o każdą osobę.
3. **Walidacja całej karty w usłudze** — po ostatnim kroku (lub komendą `waliduj`). Usługa zwraca listę
   problemów ze ścieżkami pól DTO; mapper przypina je do pól modelu.
4. **Powrót i poprawa** — Enter prowadzi tylko po polach z błędami (także konkretnej osoby z listy),
   po ostatniej poprawce automatycznie ponowna walidacja. Dwuklik w arkuszu = pojedyncza poprawka.

## Backend

- **Brak realnego API w tym repo** — `MockClientApi` odwzorowuje przepływ obecnej aplikacji
  (zapis wstępny, wyszukiwanie osób, słowniki, walidacja karty) z opóźnieniem sieci.
- Kontrakt (`api.models.ts`) jest **przykładowy, analogiczny** do obecnego — migracja polega na
  **dostosowaniu DTO, interfejsu `ClientApi` i mapperów** (docs/MIGRATION.md, kroki 5–6). Silnik i UI bez zmian.
- Reguły walidacji w mocku są przykładowe (domena testowa e-maila, kod pocztowy vs miasto, telefon osoby
  = telefon klienta, duplikaty telefonów) — prawdziwe zwróci backend.
- Kody testowe: `#1234` (4 stałe osoby), `#0000` (brak osób), inny `#NNN` (3 losowe).

## Punkty podmiany

| Co | Gdzie |
|---|---|
| Backend | `app.config.ts` → `{ provide: CLIENT_API, useClass: … }` |
| Kontrakt REST | `core/api/api.models.ts`, `core/api/client-api.ts` |
| Model ↔ DTO | `core/mappers/*` |
| Ścieżki błędów → pola | `ISSUE_PATH_MAP` |
| Kroki / pola / słowniki | `core/config/*` |
| Kolory | `src/styles/tokens.css` |

## Zachowanie względem mockupu

Zachowane 1:1: wygląd i teksty, kolejność i treść kroków, ghost-text adresu, dropdown z „najbardziej
prawdopodobne", fazy osób polecających, pipeline, szuflada „Dane klienta" z dwuklikiem, toasty,
tryb komend (⌘K/⌘F, `podsumowanie`, `fake …`), tryb ciemny (⌘Q), animacje.

Dodane (wsparcie operatora — do potwierdzenia z biznesem):

- walidacja karty w usłudze, ekran „Do poprawy", tryb poprawek, komunikaty serwera przy polach i w pipeline,
- po zakończeniu: dwuklik = pojedyncza edycja i powrót do podsumowania (w mockupie trzeba było przejść
  ponownie wszystkie dalsze kroki),
- wybór osób z klawiatury: `-2` / `+2`, Enter (ten sam kod) lub ⌘Enter = „Zatwierdź wszystkie",
- ponowne pytania o osoby zachowują poprzednie odpowiedzi jako podpowiedź (mockup je czyścił),
- filtrowanie list wyboru po wpisie (bez polskich znaków), aliasy, Tab = uzupełnienie,
- przy liście z wolnym tekstem: „rodz" + Enter wybiera „Rodzina" (tekst własny, gdy nic nie pasuje),
- komendy `waliduj`, `popraw`, `od nowa`; ⌘J = „Dane klienta",
- zapamiętanie motywu (localStorage), wielka litera także w członach nazwisk z myślnikiem,
- wpis odporny na szybkie pisanie / skaner (wartość i zaznaczenie synchronizowane od razu po Enter).

## Znane ograniczenia / do decyzji

- **⌘Q na macOS** zamyka przeglądarkę, zanim strona dostanie zdarzenie (skrót z mockupu). Działa Ctrl+Q;
  rozważyć inny skrót (np. ⌘⇧L).
- ⌘F w trybie komend przejmuje skrót wyszukiwania przeglądarki (jak w mockupie).
- Ostrzeżenia z walidacji (`severity: 'warning'`) traktowane jak błędy — do ustalenia, czy mają blokować.
- Stan karty nie jest zapisywany lokalnie — odświeżenie strony zaczyna od nowa (dane są w backendzie po
  zapisie wstępnym; ewentualne wznawianie sesji = odczyt karty z API i `fromDto`).
- Brak routingu i autoryzacji — dojdą z docelowej aplikacji.
- Node 23 (lokalnie) nie jest wspierany przez Angular 22 — zalecane LTS 22.22+ / 24.15+.

## Pytania do backendu

1. Kształt odpowiedzi walidacji karty: ścieżki pól czy kody pól? Czy są ostrzeżenia nieblokujące?
2. Czy zapis wstępny przyjmuje aktualizację (PUT) po `clientId`, czy każda zmiana tworzy nową wersję?
3. Słowniki: jeden endpoint czy osobne? Czy mają wagi/popularność do sortowania?
4. Wyszukiwanie osób: jakie dodatkowe dane zwraca i które z nich operator ma potwierdzać?
