type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Set once launch at login has been turned on for a new install. */
export const AUTOSTART_DEFAULT_KEY = 'arkivet.autostartDefaultApplied';

function readFlag(): boolean {
  try {
    return localStorage.getItem(AUTOSTART_DEFAULT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers that the default was applied, so the user's choice stands. */
export function markAutostartDefaultApplied(): void {
  try {
    localStorage.setItem(AUTOSTART_DEFAULT_KEY, '1');
  } catch {
    // storage unavailable: the default is applied again next start
  }
}

/**
 * Launch at login starts on for a new install. After that the Settings
 * switch decides; this never turns it back on.
 */
export async function applyAutostartDefault(invoke: Invoke): Promise<void> {
  if (readFlag()) return;
  try {
    const enabled = await invoke('plugin:autostart|is_enabled');
    if (!enabled) {
      await invoke('plugin:autostart|enable');
    }
    markAutostartDefaultApplied();
  } catch {
    // plugin may be unavailable in dev; try again next start
  }
}
