import { DictEntry, FieldDef, ParseResult } from './field-def';
import { FIELD_TYPES, isEmptyValue, TypeContext } from './field-types';
import { getPath, setPath } from './path';
import { FlowDef } from './step-def';

/*
 * Czyste funkcje wykonujące deklaracje pól. Bez Angulara — łatwe do testowania.
 */

/** WEJŚCIE: tekst wstawiany do command line dla obecnej wartości (bez podpowiedzi). */
export function fieldInput<M>(field: FieldDef<M>, model: M, ctx: TypeContext): string {
  if (field.input) return field.input(model);
  return FIELD_TYPES[field.type].format(getPath(model, field.id), field, ctx);
}

/** Tekst startowy: obecna wartość → podpowiedź → wartość domyślna. */
export function fieldPrefill<M>(
  field: FieldDef<M>,
  model: M,
  ctx: TypeContext,
): { value: string; suggested: boolean } {
  const current = fieldInput(field, model, ctx);
  if (current) return { value: current, suggested: false };
  const suggestion = field.suggest?.(model);
  if (suggestion) return { value: suggestion, suggested: true };
  const fallback = field.defaultValue?.(model);
  if (fallback) return { value: fallback, suggested: false };
  if (field.preselect !== false && field.type !== 'multiselect') {
    const first = fieldOptions(field, ctx)[0];
    if (first) return { value: first.label, suggested: false };
  }
  return { value: '', suggested: false };
}

export function fieldDisplay<M>(field: FieldDef<M>, model: M, ctx: TypeContext): string {
  return field.display ? field.display(model) : fieldInput(field, model, ctx);
}

export function fieldHint<M>(field: FieldDef<M>, model: M): string {
  return typeof field.hint === 'function' ? field.hint(model) : field.hint;
}

export function fieldOptions<M>(field: FieldDef<M>, ctx: TypeContext): DictEntry[] {
  return FIELD_TYPES[field.type].options?.(field, ctx) ?? [];
}

/** PARSE + wymagalność + walidatory synchroniczne. */
export function evaluateField<M>(field: FieldDef<M>, raw: string, model: M, ctx: TypeContext): ParseResult {
  const required = field.required !== false;
  if (raw.trim() === '') {
    if (!required) return { ok: true, value: field.type === 'boolean' ? null : field.type === 'multiselect' ? [] : '' };
    if (field.requiredMessage) return { ok: false, reason: field.requiredMessage };
  }
  const parsed = FIELD_TYPES[field.type].parse(raw, field, ctx);
  if (!parsed.ok) return parsed;
  if (required && isEmptyValue(parsed.value)) {
    return { ok: false, reason: field.requiredMessage ?? 'To pole jest wymagane.' };
  }
  for (const validate of field.validators ?? []) {
    const reason = validate(parsed.value, model);
    if (reason) return { ok: false, reason };
  }
  return parsed;
}

/** WYJŚCIE: zapis wartości do modelu. */
export function applyField<M>(field: FieldDef<M>, value: unknown, model: M): M {
  return field.output ? field.output(value, model) : setPath(model, field.id, value);
}

/** Czy wyliczenie dało wartość (wtedy pole nie jest pytane). */
export function isComputed<M>(field: FieldDef<M>, model: M): boolean {
  return !!field.compute && field.compute(model) !== undefined;
}

/** Czy pole jest pytane w przepływie. */
export function isAsked<M>(field: FieldDef<M>, model: M): boolean {
  return (field.visibleWhen?.(model) ?? true) && !isComputed(field, model);
}

/** Kompletne = obecna wartość przechodzi parse i walidację. */
export function isFieldComplete<M>(field: FieldDef<M>, model: M, ctx: TypeContext): boolean {
  if (isComputed(field, model)) return !isEmptyValue(field.compute!(model));
  const raw = fieldInput(field, model, ctx);
  // Pole opcjonalne pominięte pustym wpisem ('' / []) jest odpowiedziane; null = jeszcze nie pytano.
  if (!raw) return field.required === false && !field.input && answered(getPath(model, field.id));
  return evaluateField(field, raw, model, ctx).ok;
}

function answered(v: unknown): boolean {
  return v !== null && v !== undefined;
}

/** Przelicza wszystkie pola wyliczane (`compute`) — wołane po każdej zmianie modelu. */
export function applyComputed<M>(flow: FlowDef<M>, model: M): M {
  let next = model;
  for (const step of flow.steps) {
    for (const field of step.fields) {
      if (!field.compute) continue;
      const v = field.compute(next);
      if (v !== undefined && getPath(next, field.id) !== v) next = setPath(next, field.id, v);
    }
  }
  return next;
}
