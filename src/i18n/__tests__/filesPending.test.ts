/** "1 датотеки на чекање" read wrong; one file is singular. */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import mkMedical from '../locales/mk/medical.json';
import enMedical from '../locales/en/medical.json';

beforeAll(async () => {
  await i18n.init({ lng: 'mk', resources: { mk: { medical: mkMedical }, en: { medical: enMedical } }, interpolation: { escapeValue: false } });
});

describe('files pending', () => {
  it('is singular for one file and plural for more', () => {
    expect(i18n.t('medical:deviceImport.filesPending', { count: 1 })).toBe('1 датотека на чекање');
    expect(i18n.t('medical:deviceImport.filesPending', { count: 3 })).toBe('3 датотеки на чекање');
    expect(i18n.t('medical:deviceImport.filesPending', { lng: 'en', count: 1 })).toBe('1 file pending');
    expect(i18n.t('medical:deviceImport.filesPending', { lng: 'en', count: 3 })).toBe('3 files pending');
  });
});
