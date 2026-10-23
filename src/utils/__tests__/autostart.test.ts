import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyAutostartDefault, AUTOSTART_DEFAULT_KEY } from '../autostart';

// settings.md #7e / lifecycle.md #12: the app turned launch-at-login back on
// at every start, so the Settings switch could never stay off.
describe('launch at login default', () => {
  beforeEach(() => localStorage.clear());

  it('turns launch at login on the first time the app starts', async () => {
    const invoke = vi.fn(async (cmd: string) => (cmd === 'plugin:autostart|is_enabled' ? false : null));

    await applyAutostartDefault(invoke);

    expect(invoke).toHaveBeenCalledWith('plugin:autostart|enable');
    expect(localStorage.getItem(AUTOSTART_DEFAULT_KEY)).toBe('1');
  });

  it('leaves it off on later starts when the user turned it off', async () => {
    localStorage.setItem(AUTOSTART_DEFAULT_KEY, '1');
    const invoke = vi.fn(async (cmd: string) => (cmd === 'plugin:autostart|is_enabled' ? false : null));

    await applyAutostartDefault(invoke);

    expect(invoke).not.toHaveBeenCalledWith('plugin:autostart|enable');
  });

  it('does not mark the default as applied when enabling failed', async () => {
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === 'plugin:autostart|is_enabled') return false;
      throw new Error('no plugin');
    });

    await applyAutostartDefault(invoke);

    expect(localStorage.getItem(AUTOSTART_DEFAULT_KEY)).toBeNull();
  });
});
