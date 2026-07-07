/**
 * Tests for the telemetry-wrapped Tauri `invoke`.
 *
 * Strategy: mock `@tauri-apps/api/tauri`'s `invoke` to control both the
 * wrapped target command AND the `log_event` reporting call, then assert
 * that wrapped invoke (a) forwards args, (b) returns success values
 * unchanged, (c) forwards rejections to `log_event` with the right
 * subsystem/message/extras, (d) re-throws the original error so existing
 * handlers still see it, (e) does not let a `log_event` failure mask the
 * real error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mocks.tauriInvoke,
}));

// Import AFTER the mock so the module picks up the stub.
import { invoke } from '../invoke';

/**
 * The wrapper makes TWO underlying invoke calls on error: the original
 * command (which throws), then `log_event` (fire-and-forget). This helper
 * sets up that pair so each test doesn't repeat the boilerplate.
 *
 * - First call: the target command, rejecting with `commandError`
 * - Second+ calls: `log_event`, resolving with undefined
 */
function setupErrorWithReporting(commandError: unknown): void {
  mocks.tauriInvoke.mockImplementation((command: string) => {
    if (command === 'log_event') {
      return Promise.resolve(undefined);
    }
    return Promise.reject(commandError);
  });
}

/** Returns the args object passed to the most recent `log_event` call. */
function lastLogEventInput(): {
  level: string;
  subsystem: string;
  message: string;
  extras: { command: string; args: unknown; errorType: string };
} {
  const logEventCall = mocks.tauriInvoke.mock.calls
    .slice()
    .reverse()
    .find((c) => c[0] === 'log_event');
  if (!logEventCall) {
    throw new Error('No log_event call recorded');
  }
  return logEventCall[1].input;
}

describe('wrapped invoke', () => {
  beforeEach(() => {
    mocks.tauriInvoke.mockReset();
  });

  it('forwards command name and args to the underlying invoke', async () => {
    mocks.tauriInvoke.mockResolvedValue({ id: 1 });
    const result = await invoke('get_patient', { id: 1 });
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('get_patient', { id: 1 });
    expect(result).toEqual({ id: 1 });
  });

  it('returns the resolved value unchanged on success', async () => {
    mocks.tauriInvoke.mockResolvedValue([{ name: 'A' }, { name: 'B' }]);
    const result = await invoke<any[]>('get_patients');
    expect(result).toEqual([{ name: 'A' }, { name: 'B' }]);
  });

  it('does NOT call log_event on success', async () => {
    mocks.tauriInvoke.mockResolvedValue(null);
    await invoke('ping');
    // Only one call: the target command. No log_event.
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.tauriInvoke.mock.calls[0][0]).toBe('ping');
  });

  it('forwards string errors to log_event with the right shape', async () => {
    setupErrorWithReporting('DB failed');

    await expect(invoke('create_patient', { name: 'Rex' })).rejects.toBe('DB failed');

    const input = lastLogEventInput();
    expect(input.level).toBe('error');
    expect(input.subsystem).toBe('tauri.invoke');
    expect(input.message).toContain('create_patient');
    expect(input.message).toContain('DB failed');
    expect(input.extras.command).toBe('create_patient');
    expect(input.extras.args).toEqual({ name: 'Rex' });
  });

  it('extracts message from error objects', async () => {
    setupErrorWithReporting({ message: 'NOT FOUND', code: 404 });

    await expect(invoke('get_patient', { id: 99 })).rejects.toMatchObject({
      message: 'NOT FOUND',
    });

    const input = lastLogEventInput();
    expect(input.message).toContain('NOT FOUND');
  });

  it('falls back to JSON.stringify when error has no message and is not a string', async () => {
    setupErrorWithReporting({ weird: 'shape' });
    await expect(invoke('weird_cmd')).rejects.toBeTruthy();
    const input = lastLogEventInput();
    expect(input.message).toContain('"weird"');
  });

  it('re-throws the original error (not the wrapped message)', async () => {
    const originalError = 'specific string error';
    setupErrorWithReporting(originalError);

    let caught: unknown;
    try {
      await invoke('cmd');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(originalError);
  });

  it('passes null args context when invoke is called without args', async () => {
    setupErrorWithReporting('err');

    await expect(invoke('no_args_cmd')).rejects.toBe('err');

    const input = lastLogEventInput();
    expect(input.extras.args).toBe(null);
  });

  it('still re-throws when log_event itself fails (fire-and-forget)', async () => {
    // Both the target command AND log_event reject. The wrapper must
    // still propagate the ORIGINAL command's error, not the log_event
    // failure, and must not swallow either.
    mocks.tauriInvoke.mockImplementation((command: string) => {
      if (command === 'log_event') {
        return Promise.reject(new Error('log_event broke'));
      }
      return Promise.reject('original boom');
    });

    await expect(invoke('cmd')).rejects.toBe('original boom');
  });
});
