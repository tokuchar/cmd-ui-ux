# Typy pól, opcje i walidatory

Pole = `FieldDef` (`src/app/core/engine/field-def.ts`). Typ pola = wpis w `FIELD_TYPES`
(`src/app/core/engine/field-types.ts`), który robi parse / format / ghost / opcje.

## Typy

| `type` | Wpis operatora | Wartość w modelu | Format (command line, arkusz) | Ghost-text | Błąd formatu |
|---|---|---|---|---|---|
| `text` | dowolny | string (trim) | bez zmian | — | — |
| `phone` | `601234567`, `601 234 567`, `+48601234567` | `"601234567"` | `+48 601 234 567` | — | „Numer musi mieć dokładnie 9 cyfr." |
| `email` | adres | małe litery | bez zmian | — | „To nie jest poprawny adres e-mail." |
| `address` | `ul. X 1, Miasto, 00-000` | string | bez zmian | brakujące segmenty (`FieldDef.ghost` nadpisuje) | — (walidacja `V.addressPL()`) |
| `date` | `14.03.1985`, `14-03-1985`, `14031985`, `1985-03-14` | `"1985-03-14"` | `14.03.1985` | reszta maski `DD.MM.RRRR` | „Podaj poprawną datę w formacie DD.MM.RRRR." |
| `number` | `12`, `12,5` | number | bez zmian | — | „Podaj liczbę." |
| `select` | etykieta, kod lub alias (bez polskich znaków też) | `value` pozycji słownika (albo tekst przy `allowCustom`) | `label` | uzupełnienie pierwszej pasującej opcji (Tab) | „Wybierz wartość z listy (↑↓ i Enter)." |
| `boolean` | tak / t / nie / n | `true` / `false` | `tak` / `nie` | uzupełnienie | „Wpisz "tak" lub "nie"." |
| `multiselect` | `klatka, plecy`, numery z listy `1,3`, `brak` | `string[]` kodów (`[]` = brak) | etykiety po przecinku | uzupełnienie **ostatniego** tokenu; Tab dodaje pozycję | „„X" nie ma na liście…" |
| `scale` | liczba całkowita z `min`–`max` (domyślnie 1–10) | number | bez zmian | `1–10` / ` / 10` | „Podaj liczbę całkowitą od … do …." |
| `lift` | `180x3@8`, `180 x 3 @ 8.5`, `102,5kg x5`, `200` (= 1 powt.) | `{ kg, reps, rpe \| null }` | `180x3@8` | `kg x powt. @RPE` | „Format: ciężar x powtórzenia @RPE…" |

Pola opcjonalne (`required: false`): pusty Enter zapisuje `''` / `[]` i liczy się jako odpowiedź;
`null` w modelu = pytanie jeszcze nie padło (wznowienie intake od pierwszego pytania bez odpowiedzi).

Nowy typ (np. `pesel`, `nip`, `iban`, `money`): dodaj nazwę do `FieldType` i handler do `FIELD_TYPES`;
testy w `field-types.spec.ts`.

## Opcje `FieldDef`

| Opcja | Do czego | Przykład w kodzie |
|---|---|---|
| `id` | ścieżka w modelu, klucz błędów | wszędzie |
| `label`, `sheetLabel`, `placeholder`, `hint` | teksty; `hint` może być funkcją modelu (np. imię osoby) | `person.schema.ts` |
| `required` (domyślnie true), `requiredMessage` | pole opcjonalne / komunikat dla pustego | `zrodlo`, `znam` |
| `validators`, `asyncValidators` | walidacja synchroniczna / w usłudze | `adres_klienta`, `data_urodzenia` |
| `dictionary`, `options`, `allowCustom`, `preselect` | pola wyboru | `znam`, `wojewodztwo` |
| `input` / `output` | jawne wejście/wyjście (jedno pytanie ↔ kilka pól modelu) | `imie` |
| `display` | tekst w „Dane klienta" | `adres_wysylki`, `wiek` |
| `editTarget` | które pole otworzyć po dwukliku / przy poprawce | `adres_wysylki`, `wiek` |
| `visibleWhen` | czy pytać w przepływie | — (wzorzec: `(m) => m.typ === 'FIRMA'`) |
| `compute` | **pole wyliczane** — wartość ≠ undefined = wpisane automatycznie i niepytane | `adres_wysylki`, `wiek` |
| `suggest` | **pole podpowiadane** — prefill, operator zatwierdza Enterem (echo: „podpowiedź") | `wojewodztwo`, `zrodlo` |
| `defaultValue` | wartość startowa | — |
| `inSheet`, `progress` | ukrycie w arkuszu / pominięcie w % | `wysylka_same`, `wiek` |
| `ghost` | własne segmenty formatu (typ `address`) | — |

## Przepisy

**Select ze słownika z backendu, długa lista:**
```ts
{ id: 'branza', type: 'select', dictionary: 'branze', preselect: false,
  label: 'Branża', placeholder: 'zacznij pisać…', hint: 'Wybierz branżę — pisz, aby zawęzić listę.' }
```

**Data z zakresem:**
```ts
{ id: 'data_umowy', type: 'date', label: 'Data umowy', placeholder: 'DD.MM.RRRR', hint: 'Data podpisania umowy.',
  validators: [V.notFuture(), V.notBefore('2020-01-01', 'Umowy przed 2020 r. obsługuje dział archiwum.')] }
```

**Pole wyliczane (nigdy niepytane):**
```ts
{ id: 'wiek', type: 'number', label: 'Wiek', hint: '', progress: false,
  compute: (c) => ageFromIso(c.data_urodzenia), editTarget: () => 'data_urodzenia' }
```

**Pole wyliczane warunkowo (pytane, gdy nie da się wyliczyć):**
```ts
compute: (c) => (c.wysylka_same === true ? c.adres_klienta : undefined)
```

**Pole podpowiadane:**
```ts
suggest: (c) => voivodeshipFromAddress(c.adres_klienta)   // zwraca etykietę opcji
```

**Pole warunkowe:**
```ts
visibleWhen: (c) => c.forma_prawna === 'SPOLKA'
```

**Jedno pytanie, kilka pól modelu:**
```ts
input: (c) => `${c.imie} ${c.nazwisko}`.trim(),
output: (v: string, c) => ({ ...c, imie: …, nazwisko: … }),
```

**Walidacja w usłudze (async)** — walidator dostaje `ClientApi` (dodaj metodę do interfejsu i mocka);
w echo widać „⏳ Sprawdzam…", a błąd zachowuje się jak walidacja synchroniczna:
```ts
asyncValidators: [(nip, model, api) => api.checkNip(nip).pipe(map((r) => (r.ok ? null : r.message)))]
```

## Walidatory (`V.*`, `core/validation/validators.ts`)

| Walidator | Działanie |
|---|---|
| `V.required(msg?)` | niepuste |
| `V.minWords(n, msg)` | min. liczba słów |
| `V.regex(re, msg)` | wyrażenie regularne |
| `V.maxLength(n, msg?)` | max. długość |
| `V.addressPL()` | format adresu z mockupu (kod 00-000, ulica i miejscowość) |
| `V.notFuture(msg?)`, `V.notBefore(iso, msg)` | zakres dat (ISO) |
| `V.minAge(lata, msg?)` | wiek z daty urodzenia |
| `V.pesel(msg?)` | 11 cyfr + suma kontrolna |

Nowy walidator: fabryka zwracająca `(value, model) => string | null` — szablon `templates/validator.template.ts`.
