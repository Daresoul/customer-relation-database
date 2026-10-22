import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { App } from 'antd';
import type { DeviceEvent } from '../../types/deviceIntegration';
import { useDeviceEvents } from '../useDeviceEvents';

type Handler = (event: { payload: DeviceEvent }) => void;
const handlers: Record<string, Handler> = {};

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: Handler) => {
    handlers[name] = handler;
    return () => delete handlers[name];
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

afterEach(() => cleanup());

function Probe() {
  useDeviceEvents();
  return null;
}

describe('useDeviceEvents', () => {
  it('shows a device event as a translated toast with what to do', async () => {
    render(
      <App>
        <Probe />
      </App>,
    );
    await vi.waitFor(() => expect(handlers['device-event']).toBeDefined());

    act(() => {
      handlers['device-event']({
        payload: {
          integrationId: 3,
          deviceName: 'Chemistry',
          deviceType: 'mnchip_pointcare_chemistry',
          kind: 'parse_failed',
          messageKey: 'events.parseFailed',
          detail: 'No valid Healvet messages found in data',
          fileName: 'x.txt',
          fileId: 'abc',
          at: '2026-10-23T10:42:00Z',
        },
      });
    });

    expect(await screen.findByText('events.parseFailed {"device":"Chemistry"}')).toBeInTheDocument();
    expect(await screen.findByText('events.parseFailedAction')).toBeInTheDocument();
  });
});
