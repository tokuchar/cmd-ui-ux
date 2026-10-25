import { V } from './validators';

describe('validators', () => {
  it('addressPL mirrors the mockup messages', () => {
    const v = V.addressPL();
    expect(v('', {})).toBe('Adres nie może być pusty.');
    expect(v('ul. Długa 5, Warszawa', {})).toBe('Brakuje kodu pocztowego w formacie 00-000.');
    expect(v('00-123', {})).toContain('Podaj ulicę i miejscowość');
    expect(v('ul. Długa 5, Warszawa, 00-123', {})).toBeNull();
  });

  it('minWords requires the given number of words', () => {
    expect(V.minWords(2, 'err')('Jan', {})).toBe('err');
    expect(V.minWords(2, 'err')('Jan Kowalski', {})).toBeNull();
  });

  it('date validators work on ISO values', () => {
    expect(V.notFuture()('2999-01-01', {})).not.toBeNull();
    expect(V.notBefore('1900-01-01', 'err')('1899-12-31', {})).toBe('err');
    expect(V.minAge(18)('2020-01-01', {})).not.toBeNull();
    expect(V.minAge(18)('1980-01-01', {})).toBeNull();
  });

  it('pesel checks length and checksum', () => {
    expect(V.pesel()('44051401359', {})).toBeNull();
    expect(V.pesel()('44051401358', {})).not.toBeNull();
    expect(V.pesel()('123', {})).toBe('PESEL musi mieć 11 cyfr.');
  });
});
