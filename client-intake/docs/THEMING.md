# Kolory i motyw

**Jedno źródło prawdy: `src/styles/tokens.css`.** Wszystkie kolory to zmienne CSS na `:root`
(tryb jasny) i `.dark` (tryb ciemny). `src/styles.css` mapuje je na klasy Tailwinda (`@theme inline`),
więc komponenty używają klas semantycznych, a tryb ciemny działa bez wariantów `dark:`.

```
tokens.css (--brand, --app-surface, --danger…)  →  styles.css (@theme inline: --color-brand…)  →  klasy: bg-brand, bg-app-surface, text-danger…
```

## Tokeny

| Token | Klasa | Gdzie widać |
|---|---|---|
| `--brand`, `--brand-hover` | `bg-brand`, `hover:bg-brand-hover`, `ring-brand` | przycisk „Dalej", pasek postępu, ring fokusu |
| `--brand-text` | `text-brand-text` | prompt `›`, nagłówki grup w arkuszu, ikona ℹ |
| `--on-brand` | `text-on-brand` | tekst na przyciskach |
| `--app-bg` | `bg-app-bg` | tło strony |
| `--app-surface` | `bg-app-surface` | karty: command line, echo, arkusz, toast |
| `--app-popover` | `bg-app-popover` | dropdowny |
| `--app-subtle`, `--app-header` | `bg-app-subtle`, `bg-app-header` | nagłówek karty osób, pasek pipeline |
| `--app-hover` | `hover:bg-app-hover` | hover przycisków i list |
| `--app-track` | `bg-app-track` | tło paska postępu |
| `--app-text`, `--app-muted` | `text-app-text`, `text-app-muted` | tekst główny / pomocniczy |
| `--app-line` | `border-app-line` | obramowania, tor pipeline |
| `--app-empty`, `--app-empty-dim` | `text-app-empty`, `text-app-empty-dim` | „Nie podano", „—" |
| `--success*` | `text-success`, `bg-success-strong`, `border-success-line`, `bg-success-soft` | ✓, „Zatwierdź wszystkie", osoba uzupełniona |
| `--danger*` | `text-danger`, `text-danger-text`, `ring-danger-ring`, `bg-danger-soft` | ✗, błąd wpisu, komunikaty walidacji |
| `--warning` | `text-warning` | ⚠ w echo |
| `--group-1…6` | `var(--group-N)` w `GroupDef.color` | kolory sekcji pipeline |
| `--row-hover`, `--row-highlight` | `.editable-row`, podświetlenie grupy | arkusz „Dane klienta" |
| `--backdrop`, `--scrollbar*`, `--bg-image-opacity` | — | tło szuflady, scrollbar, zdjęcie w tle |

## Jak przemalować pod nową markę

1. Zmień wartości w `tokens.css` (oba bloki: `:root` i `.dark`).
2. Nowa sekcja pipeline → kolejny `--group-N` (oba bloki) i `color: 'var(--group-N)'` w `GroupDef`.
3. Nowy rodzaj koloru → token w `tokens.css` + linia `--color-<nazwa>: var(--<token>);` w `styles.css`.
4. Fonty: `--font-sans` / `--font-mono` w `styles.css` + link w `src/index.html`.
5. Tło (zdjęcie): `public/campus.png`, przezroczystość `--bg-image-opacity`.

Zakazane w komponentach: hex/rgb, palety Tailwinda (`gray-*`, `rose-*`, `emerald-*`…), warianty `dark:` dla kolorów.
