import { describe, expect, it } from 'vitest';
import en from '../locales/en/settings.json';
import mk from '../locales/mk/settings.json';

// settings.md #7c: species, breeds and rooms are only ever deactivated (kept
// for the patients and visits that use them), but the texts said "delete".
describe('deactivate texts for species, breeds and rooms', () => {
  const pick = (l: typeof en) => [
    l.species.confirmDeleteTitle,
    l.species.confirmDeleteDescription,
    l.species.deleted,
    l.breeds.confirmDeleteTitle,
    l.breeds.confirmDeleteDescription,
    l.breeds.deleted,
    l.rooms.confirmDelete,
    l.rooms.deleted,
  ];

  it('say deactivate in English', () => {
    for (const text of pick(en)) {
      expect(text).toMatch(/deactivat/i);
      expect(text).not.toMatch(/delet/i);
    }
  });

  it('say deactivate in Macedonian', () => {
    for (const text of pick(mk as unknown as typeof en)) {
      expect(text).toMatch(/деактив/i);
      expect(text).not.toMatch(/избриш|бриш/i);
    }
  });
});
