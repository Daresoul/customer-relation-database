/** Counted words read right for one and for several (i18next reads _one/_other, not _plural). */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import mkDevices from '../locales/mk/devices.json';
import mkForms from '../locales/mk/forms.json';

beforeAll(async () => {
  await i18n.init({ lng: 'mk', resources: { mk: { devices: mkDevices, forms: mkForms } }, interpolation: { escapeValue: false } });
});

describe('counted words in Macedonian', () => {
  it.each([
    ['devices:messages.detectedDevices', 'Откриен 1 уред', 'Откриени 5 уреди'],
    ['devices:drawer.attempts', '1 обид', '5 обиди'],
    ['devices:drawer.bytesLastMinute', '1 бајт во последната минута', '5 бајти во последната минута'],
    ['forms:messages.searchResults', 'Пронајден е 1 резултат', 'Пронајдени се 5 резултати'],
  ])('%s', (key, one, five) => {
    expect(i18n.t(key, { count: 1 }).replace(/ \(.*\)$/, '')).toBe(one);
    expect(i18n.t(key, { count: 5 }).replace(/ \(.*\)$/, '')).toBe(five);
  });
});
