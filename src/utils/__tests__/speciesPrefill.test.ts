import { describe, it, expect } from 'vitest';
import { findSpeciesIdByName } from '../deviceDataExtraction';
import { toTitleCase } from '../stringUtils';

// gaps L10: the device prefill only matched English species names.
describe('findSpeciesIdByName', () => {
  const macedonian = [
    { id: 1, name: 'Куче' },
    { id: 2, name: 'Мачка' },
    { id: 3, name: 'Зајак' },
  ];

  it('finds the clinic species for the English name a machine sends', () => {
    expect(findSpeciesIdByName(macedonian, 'Dog')).toBe(1);
    expect(findSpeciesIdByName(macedonian, 'CAT')).toBe(2);
    expect(findSpeciesIdByName(macedonian, 'canine')).toBe(1);
  });

  it('finds an English-named species for a Macedonian or Latin-script name', () => {
    const english = [
      { id: 7, name: 'Dog' },
      { id: 8, name: 'Cat' },
    ];
    expect(findSpeciesIdByName(english, 'куче')).toBe(7);
    expect(findSpeciesIdByName(english, 'Мачка')).toBe(8);
    expect(findSpeciesIdByName(english, 'Kuche')).toBe(7);
    expect(findSpeciesIdByName(english, 'macka')).toBe(8);
  });

  it('matches any other species by its exact name only', () => {
    expect(findSpeciesIdByName(macedonian, 'зајак')).toBe(3);
    expect(findSpeciesIdByName(macedonian, 'Horse')).toBeUndefined();
    expect(findSpeciesIdByName(macedonian, undefined)).toBeUndefined();
  });
});

// gaps L11: "GSD" was saved as "Gsd".
describe('toTitleCase', () => {
  it('capitalises the first letter of each word and keeps the rest', () => {
    expect(toTitleCase('german shepherd')).toBe('German Shepherd');
    expect(toTitleCase('GSD')).toBe('GSD');
    expect(toTitleCase('jack Russell-Terrier')).toBe('Jack Russell-Terrier');
    expect(toTitleCase('мачка')).toBe('Мачка');
  });
});
