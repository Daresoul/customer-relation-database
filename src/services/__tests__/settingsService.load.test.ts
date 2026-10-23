import { describe, it, expect, vi } from 'vitest';

vi.mock('../api', () => ({
  ApiService: { invoke: vi.fn(async () => { throw new Error('database is locked'); }) },
}));

import { SettingsService } from '../settingsService';

// settings.md #15: never stand in made-up defaults for settings that failed
// to load; Save would write them back.
describe('SettingsService.getSettings', () => {
  it('reports a failed load instead of returning defaults', async () => {
    await expect(SettingsService.getSettings()).rejects.toThrow('database is locked');
  });
});
