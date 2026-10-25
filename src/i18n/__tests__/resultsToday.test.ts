/** "денес: 1 резултати" read wrong in the machine overview. */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import mk from '../locales/mk/devices.json';
import en from '../locales/en/devices.json';

beforeAll(async () => {
  await i18n.init({ lng: 'mk', resources: { mk: { devices: mk }, en: { devices: en } }, interpolation: { escapeValue: false } });
});

describe('results today', () => {
  it('is singular for one result', () => {
    expect(i18n.t('devices:drawer.resultsToday', { count: 1 })).toBe('денес: 1 резултат');
    expect(i18n.t('devices:drawer.resultsToday', { count: 4 })).toBe('денес: 4 резултати');
    expect(i18n.t('devices:drawer.resultsToday', { lng: 'en', count: 1 })).toBe('1 result today');
  });
});
