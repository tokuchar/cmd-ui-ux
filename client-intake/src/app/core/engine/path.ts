/**
 * Odczyt/zapis wartości po ścieżce (`adres.kod`, `polecajacy[1].telefon`).
 * Ścieżka pola (`FieldDef.id`) jest wspólnym kluczem dla modelu, arkusza „Dane klienta"
 * i błędów z walidacji karty.
 */

type Segment = string | number;

export function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  for (const part of path.split('.')) {
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(part))) segments.push(m[1] !== undefined ? m[1] : Number(m[2]));
  }
  return segments;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const seg of parsePath(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Niemutujący zapis — zwraca nowy obiekt z podmienioną wartością. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const segments = parsePath(path);
  const write = (cur: any, i: number): any => {
    if (i === segments.length) return value;
    const seg = segments[i];
    const base = cur ?? (typeof seg === 'number' ? [] : {});
    const copy: any = Array.isArray(base) ? [...base] : { ...base };
    copy[seg] = write(base[seg], i + 1);
    return copy;
  };
  return write(obj, 0);
}

/** `polecajacy[2].telefon` → { list: 'polecajacy', index: 2, field: 'telefon' } */
export function parseItemPath(path: string): { list: string; index: number; field: string } | null {
  const m = /^(.+?)\[(\d+)\]\.(.+)$/.exec(path);
  return m ? { list: m[1], index: Number(m[2]), field: m[3] } : null;
}
