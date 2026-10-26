/**
 * Własne wzory ciężaru od AI (`load.method: "formula"`), np. `min(e1rm * 0.55, 60)`.
 * Bez `eval`: tokenizer + parser zstępujący. Dozwolone: liczby, zmienne, + - * / ( ), min(), max().
 */
export const FORMULA_VARS = ['e1rm', 'reps', 'rir'] as const;
export type FormulaVars = Record<(typeof FORMULA_VARS)[number], number>;

type Node = (vars: FormulaVars) => number;

export class FormulaError extends Error {}

/** Kompiluje wyrażenie; rzuca FormulaError z opisem po polsku. */
export function compileFormula(expr: string): Node {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (t?: string) => {
    const tok = tokens[pos];
    if (t !== undefined && tok !== t) throw new FormulaError(`oczekiwano „${t}", jest „${tok ?? 'koniec'}"`);
    pos++;
    return tok;
  };

  const primary = (): Node => {
    const tok = peek();
    if (tok === undefined) throw new FormulaError('niepełne wyrażenie');
    if (tok === '(') {
      take('(');
      const inner = sum();
      take(')');
      return inner;
    }
    if (tok === '-') {
      take();
      const inner = primary();
      return (v) => -inner(v);
    }
    if (/^\d/.test(tok)) {
      take();
      const n = Number(tok);
      return () => n;
    }
    if (tok === 'min' || tok === 'max') {
      take();
      take('(');
      const args = [sum()];
      while (peek() === ',') {
        take(',');
        args.push(sum());
      }
      take(')');
      const fn = tok === 'min' ? Math.min : Math.max;
      return (v) => fn(...args.map((a) => a(v)));
    }
    if ((FORMULA_VARS as readonly string[]).includes(tok)) {
      take();
      return (v) => v[tok as keyof FormulaVars];
    }
    throw new FormulaError(`nieznany symbol „${tok}" (dozwolone: ${FORMULA_VARS.join(', ')}, min, max)`);
  };

  const product = (): Node => {
    let left = primary();
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const l = left;
      const r = primary();
      left = op === '*' ? (v) => l(v) * r(v) : (v) => l(v) / r(v);
    }
    return left;
  };

  const sum = (): Node => {
    let left = product();
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const l = left;
      const r = product();
      left = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
    return left;
  };

  const root = sum();
  if (pos < tokens.length) throw new FormulaError(`nadmiarowy symbol „${tokens[pos]}"`);
  return root;
}

function tokenize(expr: string): string[] {
  const out: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[a-z0-9_]+|[-+*/(),])/giy;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(expr))) {
    out.push(m[1].toLowerCase());
    last = re.lastIndex;
  }
  if (expr.slice(last).trim()) throw new FormulaError(`niedozwolony znak „${expr.slice(last).trim()[0]}"`);
  if (!out.length) throw new FormulaError('puste wyrażenie');
  return out;
}

/** Wartość wzoru albo komunikat błędu (do walidatora / UI). */
export function evalFormula(expr: string, vars: FormulaVars): { ok: true; value: number } | { ok: false; error: string } {
  try {
    const value = compileFormula(expr)(vars);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: 'wynik nie jest liczbą' };
  } catch (e) {
    return { ok: false, error: e instanceof FormulaError ? e.message : String(e) };
  }
}
