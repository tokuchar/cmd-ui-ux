import { DictEntry, FieldDef, FieldType, ParseResult } from './field-def';
import { normalize } from './text';

/**
 * Rejestr typów pól. Typ odpowiada za:
 *  - parse:  tekst z command line → wartość domenowa (lub błąd formatu),
 *  - format: wartość domenowa → tekst (command line i „Dane klienta"),
 *  - ghost:  szary tekst podpowiedzi formatu za kursorem,
 *  - options: opcje dropdownu (select/boolean).
 * Nowy typ = nowy wpis w FIELD_TYPES + wartość w FieldType (docs/FIELD-TYPES.md).
 */
export interface FieldTypeHandler {
  parse(raw: string, field: FieldDef, ctx: TypeContext): ParseResult;
  format(value: unknown, field: FieldDef, ctx: TypeContext): string;
  ghost?(raw: string, field: FieldDef): string;
  options?(field: FieldDef, ctx: TypeContext): DictEntry[];
}

export interface TypeContext {
  /** Opcje słownika pola (DictionaryService). */
  dictionary(key: string): DictEntry[];
}

/* ---------- Telefon ---------- */

export function phoneDigits(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('48')) d = d.slice(2);
  return d;
}

/** 9 cyfr → +48XXXXXXXXX (format API). */
export function toE164(digits: string): string {
  return digits ? `+48${digits}` : '';
}

export function formatPhone(digits: string): string {
  if (!digits) return '';
  return `+48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

/* ---------- Adres ---------- */

export const ADDRESS_SEGMENTS = ['ul. Nazwa Ulicy', 'Miejscowość', '00-000'];

/** Szary „ogon" przypominający brakujące segmenty adresu (1:1 z mockupu). */
export function buildSegmentGhost(val: string, segments: string[]): string {
  if (val.trim() === '') return segments.join(', ');
  const commas = (val.match(/,/g) || []).length;
  const afterLastComma = val.slice(val.lastIndexOf(',') + 1);
  const idx = Math.min(commas, segments.length - 1);
  const labels: string[] = [];
  if (afterLastComma.trim() === '' && commas < segments.length) labels.push(segments[idx]);
  for (let i = commas + 1; i < segments.length; i++) labels.push(segments[i]);
  if (labels.length === 0) return '';
  if (afterLastComma.trim() === '') return (val.endsWith(' ') ? '' : ' ') + labels.join(', ');
  return ', ' + labels.join(', ');
}

/* ---------- Data ---------- */

const DATE_MASK = 'DD.MM.RRRR';

/** Przyjmuje DD.MM.RRRR, DD-MM-RRRR, DD/MM/RRRR, DDMMRRRR, RRRR-MM-DD → ISO RRRR-MM-DD. */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  let d: number, m: number, y: number;
  let match = /^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/.exec(v);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{2})(\d{2})(\d{4})$/.exec(v))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDate(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

/* ---------- Wybór z listy ---------- */

export function findOption(options: DictEntry[], raw: string): DictEntry | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  return options.find(
    (o) => normalize(o.label) === n || normalize(o.value) === n || (o.aliases ?? []).some((a) => normalize(a) === n),
  );
}

export const BOOLEAN_OPTIONS: DictEntry[] = [
  { value: 'tak', label: 'Tak', aliases: ['t', 'y', 'yes'] },
  { value: 'nie', label: 'Nie', aliases: ['n', 'no'] },
];

function selectOptions(field: FieldDef, ctx: TypeContext): DictEntry[] {
  return field.options ?? (field.dictionary ? ctx.dictionary(field.dictionary) : []);
}

/* ---------- Wiele z listy ---------- */

/** Słowa oznaczające pustą odpowiedź w multiselect („brak", „nic", „-"). */
export const NONE_WORDS = ['brak', 'nic', 'zadne', 'none', '-'];

/** „klatka, plecy" / „1,3" (numery z listy) → tokeny wpisu. */
export function splitTokens(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Ostatni (właśnie wpisywany) token — do filtrowania dropdownu multiselect. */
export function lastToken(raw: string): string {
  const i = Math.max(raw.lastIndexOf(','), raw.lastIndexOf(';'));
  return raw.slice(i + 1).trim();
}

/** Podmienia ostatni token na wybraną opcję i dokleja separator do kolejnej. */
export function replaceLastToken(raw: string, label: string): string {
  const i = Math.max(raw.lastIndexOf(','), raw.lastIndexOf(';'));
  const head = i === -1 ? '' : raw.slice(0, i + 1) + ' ';
  return `${head}${label}, `;
}

/* ---------- Bój: kg × powtórzenia @RPE ---------- */

export interface LiftSet {
  kg: number;
  reps: number;
  /** null = nie podano (traktowane jak RPE 10). */
  rpe: number | null;
}

/** „180x3@8", „180 x 3 @ 8.5", „180kg 3 rpe8", „180" (= 1 powtórzenie). */
export function parseLift(raw: string): LiftSet | null {
  const v = raw.trim().toLowerCase().replace(',', '.').replace(/kg/g, ' ');
  const m = /^(\d+(?:\.\d+)?)\s*(?:[x×*]\s*|\s+)?(\d{1,2})?\s*(?:(?:@|rpe)\s*(\d+(?:\.5)?))?$/.exec(v);
  if (!m) return null;
  const kg = Number(m[1]);
  const reps = m[2] ? Number(m[2]) : 1;
  const rpe = m[3] ? Number(m[3]) : null;
  if (!(kg > 0) || reps < 1 || reps > 20 || (rpe !== null && (rpe < 5 || rpe > 10))) return null;
  return { kg, reps, rpe };
}

export function formatLift(v: unknown): string {
  const l = v as LiftSet | null;
  if (!l || typeof l !== 'object' || !l.kg) return '';
  return `${l.kg}x${l.reps}${l.rpe !== null && l.rpe !== undefined ? `@${l.rpe}` : ''}`;
}

const LIFT_SEGMENTS = ['kg', 'x powt.', '@RPE'];

/* ---------- Rejestr ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FIELD_TYPES: Record<FieldType, FieldTypeHandler> = {
  text: {
    parse: (raw) => ({ ok: true, value: raw.trim() }),
    format: (v) => String(v ?? ''),
  },

  phone: {
    parse: (raw) => {
      const d = phoneDigits(raw);
      return d.length === 9 ? { ok: true, value: d } : { ok: false, reason: 'Numer musi mieć dokładnie 9 cyfr.' };
    },
    format: (v) => formatPhone(phoneDigits(v)),
  },

  email: {
    parse: (raw) =>
      EMAIL_RE.test(raw.trim())
        ? { ok: true, value: raw.trim().toLowerCase() }
        : { ok: false, reason: 'To nie jest poprawny adres e-mail.' },
    format: (v) => String(v ?? ''),
  },

  address: {
    parse: (raw) => ({ ok: true, value: raw.trim() }),
    format: (v) => String(v ?? ''),
    ghost: (raw, field) => buildSegmentGhost(raw, field.ghost ?? ADDRESS_SEGMENTS),
  },

  date: {
    parse: (raw) => {
      const iso = parseDate(raw);
      return iso ? { ok: true, value: iso } : { ok: false, reason: 'Podaj poprawną datę w formacie DD.MM.RRRR.' };
    },
    format: (v) => formatDate(v),
    ghost: (raw) => (/^[\d.]{0,9}$/.test(raw) ? DATE_MASK.slice(raw.length) : ''),
  },

  number: {
    parse: (raw) => {
      const n = Number(raw.trim().replace(',', '.'));
      return raw.trim() !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: 'Podaj liczbę.' };
    },
    format: (v) => (v === null || v === undefined || v === '' ? '' : String(v)),
  },

  select: {
    parse: (raw, field, ctx) => {
      const hit = findOption(selectOptions(field, ctx), raw);
      if (hit) return { ok: true, value: hit.value };
      if (field.allowCustom || raw.trim() === '') return { ok: true, value: raw.trim() };
      return { ok: false, reason: 'Wybierz wartość z listy (↑↓ i Enter).' };
    },
    format: (v, field, ctx) => {
      if (v === null || v === undefined || v === '') return '';
      const hit = selectOptions(field, ctx).find((o) => o.value === v);
      return hit ? hit.label : String(v);
    },
    options: selectOptions,
  },

  multiselect: {
    parse: (raw, field, ctx) => {
      const tokens = splitTokens(raw);
      if (tokens.length === 1 && NONE_WORDS.includes(normalize(tokens[0]))) return { ok: true, value: [] };
      const options = selectOptions(field, ctx);
      const out: string[] = [];
      for (const t of tokens) {
        const byNumber = /^\d+$/.test(t) ? options[Number(t) - 1] : undefined;
        const hit = byNumber ?? findOption(options, t);
        if (hit) out.includes(hit.value) || out.push(hit.value);
        else if (field.allowCustom) out.includes(t) || out.push(t);
        else return { ok: false, reason: `„${t}" nie ma na liście — wybierz z listy (Tab dodaje kolejną pozycję).` };
      }
      return { ok: true, value: out };
    },
    format: (v, field, ctx) => {
      if (!Array.isArray(v)) return '';
      if (!v.length) return 'brak';
      const options = selectOptions(field, ctx);
      return v.map((x) => options.find((o) => o.value === x)?.label ?? String(x)).join(', ');
    },
    options: selectOptions,
  },

  scale: {
    parse: (raw, field) => {
      const min = field.min ?? 1;
      const max = field.max ?? 10;
      const n = Number(raw.trim().replace(',', '.'));
      return raw.trim() !== '' && Number.isInteger(n) && n >= min && n <= max
        ? { ok: true, value: n }
        : { ok: false, reason: `Podaj liczbę całkowitą od ${min} do ${max}.` };
    },
    format: (v) => (typeof v === 'number' ? String(v) : ''),
    ghost: (raw, field) => (raw.trim() && /^\d+$/.test(raw.trim()) ? ` / ${field.max ?? 10}` : `${field.min ?? 1}–${field.max ?? 10}`),
  },

  lift: {
    parse: (raw) => {
      const l = parseLift(raw);
      return l ? { ok: true, value: l } : { ok: false, reason: 'Format: ciężar x powtórzenia @RPE, np. 180x3@8 (RPE opcjonalne).' };
    },
    format: (v) => formatLift(v),
    ghost: (raw) => {
      if (raw.trim() === '') return LIFT_SEGMENTS.join(' ');
      if (/^\d+(\.\d+)?$/.test(raw.trim())) return (raw.endsWith(' ') ? '' : ' ') + 'x powt. @RPE';
      if (/x\s*\d+$/i.test(raw.trim()) && !raw.includes('@')) return ' @RPE';
      return '';
    },
  },

  boolean: {
    parse: (raw, field) => {
      const hit = findOption(field.options ?? BOOLEAN_OPTIONS, raw);
      if (!hit) return { ok: false, reason: 'Wpisz "tak" lub "nie".' };
      return { ok: true, value: hit.value === 'tak' };
    },
    format: (v) => (v === true ? 'tak' : v === false ? 'nie' : ''),
    options: (field) => field.options ?? BOOLEAN_OPTIONS,
  },
};

export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}
