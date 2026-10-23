/**
 * frontend-data #11: listeners were set up with the handler of the first
 * render (stale closures), and an unmount before `listen` resolved left the
 * listener attached for good.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const events = vi.hoisted(() => ({
  handlers: new Map<string, (e: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
  resolveListen: null as null | (() => void),
  deferred: false,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: (e: { payload: unknown }) => void) => {
    events.handlers.set(name, handler);
    if (!events.deferred) return Promise.resolve(events.unlisten);
    return new Promise((resolve) => {
      events.resolveListen = () => resolve(events.unlisten);
    });
  },
}));

import { useTauriEvent } from '../useTauriEvent';

describe('useTauriEvent', () => {
  beforeEach(() => {
    events.handlers.clear();
    events.unlisten.mockReset();
    events.deferred = false;
  });

  it('calls the handler of the latest render', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ h }) => useTauriEvent('patient-created', h), { initialProps: { h: first } });
    await Promise.resolve();

    rerender({ h: second });
    events.handlers.get('patient-created')!({ payload: { id: 3 } });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: 3 });
  });

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useTauriEvent('patient-created', vi.fn()));
    await Promise.resolve();
    unmount();
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted before the listener was ready', async () => {
    events.deferred = true;
    const { unmount } = renderHook(() => useTauriEvent('patient-created', vi.fn()));
    unmount();
    events.resolveListen!();
    await Promise.resolve();
    await Promise.resolve();
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });
});
