import { FieldDef } from './field-def';
import { buildSegmentGhost, ADDRESS_SEGMENTS, FIELD_TYPES, formatPhone, parseDate, parseLift, replaceLastToken, TypeContext } from './field-types';

const ctx: TypeContext = { dictionary: () => [{ value: 'RODZINA', label: 'Rodzina', aliases: ['rodz.'] }] };
const field = (f: Partial<FieldDef>): FieldDef => ({ id: 'x', type: 'text', label: 'X', hint: '', ...f });

describe('field types', () => {
  it('phone accepts 9 digits, spaces and +48 prefix', () => {
    const phone = FIELD_TYPES.phone;
    expect(phone.parse('601 234 567', field({ type: 'phone' }), ctx)).toEqual({ ok: true, value: '601234567' });
    expect(phone.parse('+48601234567', field({ type: 'phone' }), ctx)).toEqual({ ok: true, value: '601234567' });
    expect(phone.parse('60123', field({ type: 'phone' }), ctx).ok).toBe(false);
    expect(formatPhone('601234567')).toBe('+48 601 234 567');
  });

  it('email is trimmed and lowercased', () => {
    expect(FIELD_TYPES.email.parse(' Jan@Firma.PL ', field({ type: 'email' }), ctx)).toEqual({ ok: true, value: 'jan@firma.pl' });
    expect(FIELD_TYPES.email.parse('jan@', field({ type: 'email' }), ctx).ok).toBe(false);
  });

  it('date accepts several formats and rejects impossible dates', () => {
    expect(parseDate('14.03.1985')).toBe('1985-03-14');
    expect(parseDate('14031985')).toBe('1985-03-14');
    expect(parseDate('1985-03-14')).toBe('1985-03-14');
    expect(parseDate('31.02.2020')).toBeNull();
    expect(FIELD_TYPES.date.format('1985-03-14', field({ type: 'date' }), ctx)).toBe('14.03.1985');
  });

  it('select matches label, value or alias without diacritics; custom only when allowed', () => {
    const sel = field({ type: 'select', dictionary: 'relacje' });
    expect(FIELD_TYPES.select.parse('rodzina', sel, ctx)).toEqual({ ok: true, value: 'RODZINA' });
    expect(FIELD_TYPES.select.parse('rodz.', sel, ctx)).toEqual({ ok: true, value: 'RODZINA' });
    expect(FIELD_TYPES.select.parse('kolega', sel, ctx).ok).toBe(false);
    expect(FIELD_TYPES.select.parse('kolega', { ...sel, allowCustom: true }, ctx)).toEqual({ ok: true, value: 'kolega' });
    expect(FIELD_TYPES.select.format('RODZINA', sel, ctx)).toBe('Rodzina');
  });

  it('boolean understands tak/t/nie/n', () => {
    const b = field({ type: 'boolean' });
    expect(FIELD_TYPES.boolean.parse('T', b, ctx)).toEqual({ ok: true, value: true });
    expect(FIELD_TYPES.boolean.parse('nie', b, ctx)).toEqual({ ok: true, value: false });
    expect(FIELD_TYPES.boolean.parse('może', b, ctx).ok).toBe(false);
  });

  it('address ghost shows the remaining segments (1:1 with the mockup)', () => {
    expect(buildSegmentGhost('', ADDRESS_SEGMENTS)).toBe('ul. Nazwa Ulicy, Miejscowość, 00-000');
    expect(buildSegmentGhost('ul. Długa 5', ADDRESS_SEGMENTS)).toBe(', Miejscowość, 00-000');
    expect(buildSegmentGhost('ul. Długa 5, Warszawa, ', ADDRESS_SEGMENTS)).toBe('00-000');
  });

  it('multiselect accepts labels, aliases and list numbers; "brak" = empty list', () => {
    const days = field({ type: 'multiselect', options: [{ value: 'pn', label: 'Poniedziałek', aliases: ['pn'] }, { value: 'wt', label: 'Wtorek' }, { value: 'sr', label: 'Środa' }] });
    expect(FIELD_TYPES.multiselect.parse('pn, sroda', days, ctx)).toEqual({ ok: true, value: ['pn', 'sr'] });
    expect(FIELD_TYPES.multiselect.parse('2; 1, 2', days, ctx)).toEqual({ ok: true, value: ['wt', 'pn'] });
    expect(FIELD_TYPES.multiselect.parse('brak', days, ctx)).toEqual({ ok: true, value: [] });
    expect(FIELD_TYPES.multiselect.parse('pn, piątek', days, ctx).ok).toBe(false);
    expect(FIELD_TYPES.multiselect.format(['pn', 'sr'], days, ctx)).toBe('Poniedziałek, Środa');
    expect(replaceLastToken('Poniedziałek, śr', 'Środa')).toBe('Poniedziałek, Środa, ');
  });

  it('scale checks integer range from field min/max', () => {
    const pain = field({ type: 'scale', min: 0, max: 10 });
    expect(FIELD_TYPES.scale.parse('0', pain, ctx)).toEqual({ ok: true, value: 0 });
    expect(FIELD_TYPES.scale.parse('11', pain, ctx).ok).toBe(false);
    expect(FIELD_TYPES.scale.parse('5.5', pain, ctx).ok).toBe(false);
  });

  it('lift parses kg x reps @RPE in several notations', () => {
    expect(parseLift('180x3@8')).toEqual({ kg: 180, reps: 3, rpe: 8 });
    expect(parseLift('180 x 3 @ 8.5')).toEqual({ kg: 180, reps: 3, rpe: 8.5 });
    expect(parseLift('102,5kg x5')).toEqual({ kg: 102.5, reps: 5, rpe: null });
    expect(parseLift('200')).toEqual({ kg: 200, reps: 1, rpe: null });
    expect(parseLift('180x3@11')).toBeNull();
    expect(FIELD_TYPES.lift.format({ kg: 180, reps: 3, rpe: 8 }, field({ type: 'lift' }), ctx)).toBe('180x3@8');
  });
});
