import { fromDictionaryDtos } from './dictionary.mapper';

describe('mappers', () => {
  it('dictionaries are sorted by weight (most probable first)', () => {
    const d = fromDictionaryDtos([{ code: 'r', entries: [{ code: 'B', label: 'b', weight: 1 }, { code: 'A', label: 'a', weight: 9 }] }]);
    expect(d['r'].map((e) => e.value)).toEqual(['A', 'B']);
  });
});
