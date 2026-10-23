type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Set once launch at login has been turned on for a new install. */
export const AUTOSTART_DEFAULT_KEY = 'arkivet.autostartDefaultApplied';

/** Turns launch at login on unless it is already enabled. */
export async function applyAutostartDefault(invoke: Invoke): Promise<void> {
  try {
    const enabled = await invoke('plugin:autostart|is_enabled');
    if (!enabled) {
      await invoke('plugin:autostart|enable');
    }
  } catch {
    // plugin may be unavailable in dev; ignore
  }
}
