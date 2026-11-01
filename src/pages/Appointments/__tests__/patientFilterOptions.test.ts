import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { patientFilterOptions } from '../patientFilterOptions';

// Final review (low): the Macedonian filter showed "Bella · Dog".
describe('patient filter options', () => {
  it('names the species in the app language', () => {
    const t = ((key: string) => (key === 'entities:species.dog' ? 'Куче' : key)) as unknown as TFunction;
    expect(patientFilterOptions([{ id: 3, name: 'Bella', species: 'Dog' }], t)).toEqual([{ value: 3, label: 'Bella · Куче' }]);
    expect(patientFilterOptions([{ id: 4, name: 'Rex', species: null }], t)).toEqual([{ value: 4, label: 'Rex' }]);
  });
});
