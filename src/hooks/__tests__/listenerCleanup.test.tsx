/**
 * A component unmounted before Tauri's `listen` resolved must still remove
 * its listener; otherwise every remount stacks another live listener.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const events = vi.hoisted(() => ({
  unlisten: vi.fn(),
  resolvers: [] as Array<() => void>,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () =>
    new Promise((resolve) => {
      events.resolvers.push(() => resolve(events.unlisten));
    }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../contexts/useDeviceImport', () => ({ useDeviceImport: () => ({ receiveDeviceResult: vi.fn() }) }));
vi.mock('antd', () => ({ App: { useApp: () => ({ notification: { info: vi.fn(), error: vi.fn() } }) } }));

import { useDeviceConnectionStatus, useFileWatcherStatus } from '../useDeviceIntegrations';
import { useDeviceDataListener } from '../useDeviceDataListener';

async function unmountBeforeListenResolves(hook: () => unknown) {
  const { unmount } = renderHook(hook);
  unmount();
  events.resolvers.forEach((resolve) => resolve());
  await new Promise((r) => setTimeout(r, 0));
}

describe('listeners unmounted before they are ready', () => {
  beforeEach(() => {
    events.unlisten.mockReset();
    events.resolvers = [];
  });

  it('device connection status removes its listener', async () => {
    await unmountBeforeListenResolves(() => useDeviceConnectionStatus());
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });

  it('file watcher status removes its listener', async () => {
    await unmountBeforeListenResolves(() => useFileWatcherStatus());
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });

  it('device data listener removes its listener', async () => {
    await unmountBeforeListenResolves(() => useDeviceDataListener());
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });
});
