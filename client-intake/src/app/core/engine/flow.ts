import { FieldDef } from './field-def';
import { isAsked, isComputed, isFieldComplete } from './field-runtime';
import { TypeContext } from './field-types';
import { getPath } from './path';
import { FlowDef, StepDef } from './step-def';

/** Pozycja w przepływie: pole kroku albo cały krok-kolekcja (field = -1). */
export interface FlowPosition {
  step: number;
  field: number;
}

/** Wszystkie pozycje, o które silnik zapyta przy obecnym modelu (w kolejności). */
export function askedPositions<M>(flow: FlowDef<M>, model: M): FlowPosition[] {
  const out: FlowPosition[] = [];
  flow.steps.forEach((step, s) => {
    if (step.collection) out.push({ step: s, field: -1 });
    else step.fields.forEach((f, i) => isAsked(f, model) && out.push({ step: s, field: i }));
  });
  return out;
}

/** Pierwsza pozycja bez odpowiedzi (wznowienie zapisanego profilu); undefined = wszystko odpowiedziane. */
export function firstOpenPosition<M>(flow: FlowDef<M>, model: M, ctx: TypeContext): FlowPosition | undefined {
  return askedPositions(flow, model).find((p) => {
    const step = flow.steps[p.step];
    return step.collection ? !collectionDone(step, model) : !isFieldComplete(step.fields[p.field], model, ctx);
  });
}

/** Kroki, które mają cokolwiek do zapytania — podstawa licznika „Krok N / M". */
export function visibleSteps<M>(flow: FlowDef<M>, model: M): number[] {
  return [...new Set(askedPositions(flow, model).map((p) => p.step))];
}

export function stepNumber<M>(flow: FlowDef<M>, model: M, step: number): { n: number; total: number } {
  const visible = visibleSteps(flow, model);
  const idx = visible.indexOf(step);
  return { n: idx === -1 ? step + 1 : idx + 1, total: visible.length };
}

function counts<M>(field: FieldDef<M>, model: M): boolean {
  return field.progress !== false && (isAsked(field, model) || isComputed(field, model));
}

function collectionDone<M>(step: StepDef<M>, model: M): boolean {
  const items = getPath(model, step.collection!.target);
  return Array.isArray(items) && (items.length > 0 || !!step.collection!.allowEmpty);
}

/** % kompletności każdej grupy (pipeline). */
export function groupProgress<M>(flow: FlowDef<M>, model: M, ctx: TypeContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of flow.groups) {
    let total = 0;
    let done = 0;
    for (const step of flow.steps.filter((s) => s.group === group.id)) {
      if (step.collection) {
        total++;
        if (collectionDone(step, model)) done++;
        continue;
      }
      for (const field of step.fields) {
        if (!counts(field, model)) continue;
        total++;
        if (isFieldComplete(field, model, ctx)) done++;
      }
    }
    out[group.id] = total === 0 ? 0 : Math.round((done / total) * 100);
  }
  return out;
}

/**
 * Grupy opcjonalne przy obecnym modelu — takie, które nie wliczają się do total
 * (same kolekcje z countInTotal !== true, bez liczonych pól). Pusta grupa opcjonalna
 * pokazuje status „opcjonalne" zamiast „oczekuje", żeby nie przeczyć 100% całości.
 */
export function optionalGroups<M>(flow: FlowDef<M>, model: M, ctx: TypeContext): Set<string> {
  const out = new Set<string>();
  for (const group of flow.groups) {
    let weight = 0;
    for (const step of flow.steps.filter((s) => s.group === group.id)) {
      if (step.collection) {
        if (step.collection.countInTotal) weight++;
        continue;
      }
      for (const field of step.fields) if (counts(field, model)) weight++;
    }
    if (weight === 0) out.add(group.id);
  }
  return out;
}

/** % kompletności całej karty (pasek u góry i „Dane klienta"). */
export function totalProgress<M>(flow: FlowDef<M>, model: M, ctx: TypeContext): number {
  let total = 0;
  let done = 0;
  for (const step of flow.steps) {
    if (step.collection) {
      if (!step.collection.countInTotal) continue;
      total++;
      if (collectionDone(step, model)) done++;
      continue;
    }
    for (const field of step.fields) {
      if (!counts(field, model)) continue;
      total++;
      if (isFieldComplete(field, model, ctx)) done++;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Znajduje krok/pole po id pola. */
export function findField<M>(flow: FlowDef<M>, fieldId: string): FlowPosition | null {
  for (let s = 0; s < flow.steps.length; s++) {
    const i = flow.steps[s].fields.findIndex((f) => f.id === fieldId);
    if (i !== -1) return { step: s, field: i };
  }
  return null;
}

export function findCollectionStep<M>(flow: FlowDef<M>, target: string): number {
  return flow.steps.findIndex((s) => s.collection?.target === target);
}
