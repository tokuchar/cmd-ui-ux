# Szablon sekcji kroku do docs/STEPS.md

### Krok N — `<id-kroku>` (`steps/<plik>.ts`)

Stara aplikacja: `<komponent / ekran kreatora>`, formularz `<nazwa FormGroup>`.

| id | typ | label / sheetLabel | wejście → wyjście | walidacja | słownik / compute / suggest / visibleWhen | DTO | błędy serwera |
|---|---|---|---|---|---|---|---|
| `<pole>` | text | <Nagłówek> / <Etykieta arkusza> | — | `V.required()` | — | `client.<pole>` | `<KOD_BLEDU>` |

Checklista:
- [ ] przejście Enterem z poprawną wartością
- [ ] błędna wartość → komunikat PL, pole nie przechodzi
- [ ] Wstecz pokazuje zapisaną wartość
- [ ] wiersz w „Dane klienta" + dwuklik
- [ ] mapper DTO + test
- [ ] błędy serwera w `ISSUE_PATH_MAP`
