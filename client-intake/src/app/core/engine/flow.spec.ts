import { DICTIONARIES } from '../config/dictionaries.config';
import { buildFlow } from '../config/flow.config';
import { Customer, emptyCustomer } from '../models/customer.model';
import { applyComputed, applyField, evaluateField, fieldPrefill } from './field-runtime';
import { TypeContext } from './field-types';
import { askedPositions, findField, groupProgress, stepNumber, totalProgress } from './flow';

const ctx: TypeContext = { dictionary: (k) => DICTIONARIES[k] ?? [] };
const flow = buildFlow({ demoFields: false });
const fieldOf = (id: string) => {
  const p = findField(flow, id)!;
  return flow.steps[p.step].fields[p.field];
};
const filled = (patch: Partial<Customer>): Customer => applyComputed(flow, { ...emptyCustomer(), ...patch });

describe('flow rules (1:1 with the mockup)', () => {
  it('has 6 logical steps; shipping question and address share step 5', () => {
    const m = emptyCustomer();
    expect(stepNumber(flow, m, findField(flow, 'adres_wysylki')!.step)).toEqual({ n: 5, total: 6 });
    expect(stepNumber(flow, m, findField(flow, 'wysylka_same')!.step)).toEqual({ n: 5, total: 6 });
  });

  it('skips the shipping address when it is the same as the client address', () => {
    const same = filled({ adres_klienta: 'ul. Długa 5, Warszawa, 00-123', wysylka_same: true });
    const ids = askedPositions(flow, same)
      .filter((p) => p.field >= 0)
      .map((p) => flow.steps[p.step].fields[p.field].id);
    expect(ids).not.toContain('adres_wysylki');
    // pole wyliczane: kopia adresu klienta
    expect(same.adres_wysylki).toBe('ul. Długa 5, Warszawa, 00-123');
  });

  it('computes group and total progress like the mockup', () => {
    const m = filled({ imie: 'Jan', nazwisko: 'Kowalski', telefon: '601234567', adres_klienta: 'ul. Długa 5, Warszawa, 00-123' });
    expect(groupProgress(flow, m, ctx)).toEqual({ podstawowe: 67, adresy: 50, polecajacy: 0 });
    expect(totalProgress(flow, m, ctx)).toBe(60);
    const done = filled({ ...m, email: 'jan@firma.pl', wysylka_same: true });
    expect(groupProgress(flow, done, ctx)['adresy']).toBe(100);
    expect(totalProgress(flow, done, ctx)).toBe(100);
  });

  it('name field: one input, two model fields (explicit input/output)', () => {
    const f = fieldOf('imie');
    const res = evaluateField(f, 'jan kowalski-nowak', emptyCustomer(), ctx);
    expect(res.ok).toBe(true);
    const m = applyField(f, (res as { value: unknown }).value, emptyCustomer());
    expect([m.imie, m.nazwisko]).toEqual(['Jan', 'Kowalski-Nowak']);
    expect(fieldPrefill(f, m, ctx).value).toBe('Jan Kowalski-Nowak');
    expect(evaluateField(f, 'Jan', emptyCustomer(), ctx)).toEqual({
      ok: false,
      reason: 'Podaj zarówno imię, jak i nazwisko (dwa słowa).',
    });
  });

  it('choice fields pre-fill the most probable option', () => {
    expect(fieldPrefill(fieldOf('wysylka_same'), emptyCustomer(), ctx).value).toBe('Tak');
  });
});
