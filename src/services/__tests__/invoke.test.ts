/**
 * Tests for the Sentry-wrapped Tauri `invoke`.
 *
 * Strategy: mock both `@tauri-apps/api/tauri` and `@sentry/react`, then assert
 * that wrapped invoke (a) forwards args, (b) returns success values unchanged,
 * (c) captures on rejection with command/args context, (d) re-throws so
 * existing handlers still see the error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level mocks. Using `vi.hoisted` so the mock factory has access to
// shared spies that the test bodies can introspect.
const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  sentryCapture: vi.fn(),
  sentryWithScope: vi.fn((fn: any) => {
    const scope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
    };
    fn(scope);
    return scope;
  }),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mocks.tauriInvoke,
}));

vi.mock('@sentry/react', () => ({
  captureException: mocks.sentryCapture,
  withScope: mocks.sentryWithScope,
}));

// Import AFTER the mocks so the module picks up the stubs.
import { invoke } from '../invoke';

describe('wrapped invoke', () => {
  beforeEach(() => {
    mocks.tauriInvoke.mockReset();
    mocks.sentryCapture.mockReset();
    mocks.sentryWithScope.mockClear();
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
    expect(mocks.sentryCapture).not.toHaveBeenCalled();
  });

  it('does not call Sentry on success', async () => {
    mocks.tauriInvoke.mockResolvedValue(null);
    await invoke('ping');
    expect(mocks.sentryCapture).not.toHaveBeenCalled();
    expect(mocks.sentryWithScope).not.toHaveBeenCalled();
  });

  it('captures string errors with command + args context', async () => {
    mocks.tauriInvoke.mockRejectedValue('DB failed');

    await expect(invoke('create_patient', { name: 'Rex' })).rejects.toBe('DB failed');

    expect(mocks.sentryWithScope).toHaveBeenCalledTimes(1);
    expect(mocks.sentryCapture).toHaveBeenCalledTimes(1);
    const captured = mocks.sentryCapture.mock.calls[0][0] as Error;
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toContain('create_patient');
    expect(captured.message).toContain('DB failed');
  });

  it('captures error objects with .message', async () => {
    mocks.tauriInvoke.mockRejectedValue({ message: 'NOT FOUND', code: 404 });

    await expect(invoke('get_patient', { id: 99 })).rejects.toMatchObject({ message: 'NOT FOUND' });

    expect(mocks.sentryCapture).toHaveBeenCalledTimes(1);
    const captured = mocks.sentryCapture.mock.calls[0][0] as Error;
    expect(captured.message).toContain('NOT FOUND');
  });

  it('falls back to JSON.stringify when error has no message and is not a string', async () => {
    mocks.tauriInvoke.mockRejectedValue({ weird: 'shape' });
    await expect(invoke('weird_cmd')).rejects.toBeTruthy();
    const captured = mocks.sentryCapture.mock.calls[0][0] as Error;
    expect(captured.message).toContain('"weird"');
  });

  it('re-throws the original error (not the captured Error)', async () => {
    const originalError = 'specific string error';
    mocks.tauriInvoke.mockRejectedValue(originalError);

    let caught: unknown;
    try {
      await invoke('cmd');
    } catch (e) {
      caught = e;
    }
    // The original error string is what existing consumer try/catch sees —
    // NOT the Error object Sentry got.
    expect(caught).toBe(originalError);
  });

  it('tags the Sentry event with tauri.command and command/args context', async () => {
    mocks.tauriInvoke.mockRejectedValue('boom');

    let scopeRef: any;
    mocks.sentryWithScope.mockImplementation((fn: any) => {
      scopeRef = { setTag: vi.fn(), setContext: vi.fn() };
      fn(scopeRef);
    });

    await expect(invoke('delete_patient', { id: 42 })).rejects.toBe('boom');

    expect(scopeRef.setTag).toHaveBeenCalledWith('tauri.command', 'delete_patient');
    expect(scopeRef.setContext).toHaveBeenCalledWith(
      'tauri',
      expect.objectContaining({
        command: 'delete_patient',
        args: { id: 42 },
      }),
    );
  });

  it('passes null args context when invoke is called without args', async () => {
    mocks.tauriInvoke.mockRejectedValue('err');

    let scopeRef: any;
    mocks.sentryWithScope.mockImplementation((fn: any) => {
      scopeRef = { setTag: vi.fn(), setContext: vi.fn() };
      fn(scopeRef);
    });

    await expect(invoke('no_args_cmd')).rejects.toBe('err');
    expect(scopeRef.setContext).toHaveBeenCalledWith(
      'tauri',
      expect.objectContaining({ args: null }),
    );
  });
});
