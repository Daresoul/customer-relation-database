/**
 * The default species are stored in English ("Dog", "Guinea Pig"); every
 * place that shows one uses the app language. A species the app has no word
 * for (one the clinic added) keeps its own name.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { speciesLabel } from '../species';
import mkEntities from '../../i18n/locales/mk/entities.json';
import enEntities from '../../i18n/locales/en/entities.json';

beforeAll(async () => {
  await i18n.init({
    lng: 'mk',
    resources: { mk: { entities: mkEntities }, en: { entities: enEntities } },
    interpolation: { escapeValue: false },
  });
});

describe('speciesLabel', () => {
  it('translates the default species', () => {
    expect(speciesLabel(i18n.t, 'Dog')).toBe('Куче');
    expect(speciesLabel(i18n.t, 'Cat')).toBe('Мачка');
  });

  it('handles names with a space', () => {
    expect(speciesLabel(i18n.t, 'Guinea Pig')).toBe(mkEntities.species.guinea_pig);
  });

  it('keeps a species the app has no word for', () => {
    expect(speciesLabel(i18n.t, 'Игуана')).toBe('Игуана');
    expect(speciesLabel(i18n.t, 'Axolotl')).toBe('Axolotl');
  });

  it('is empty for no species', () => {
    expect(speciesLabel(i18n.t, null)).toBe('');
  });
});
