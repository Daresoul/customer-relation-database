import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App, Form } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && ('synced' in opts || 'when' in opts) ? `${key}|${JSON.stringify(opts)}` : key,
  }),
}));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import AppointmentsSettings from '../components/AppointmentsSettings';

function renderSettings() {
  return render(
    <App>
      <Form>
        <AppointmentsSettings isUpdating={false} />
      </Form>
    </App>,
  );
}

function backend(settings: Record<string, unknown>, sync?: Record<string, unknown>) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_google_calendar_settings') return settings;
    if (cmd === 'trigger_manual_sync') return sync;
    return null;
  });
}

describe('Google Calendar settings', () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    document.body.innerHTML = '';
  });

  it('an expired login asks to reconnect instead of saying Connected', async () => {
    backend({ connected: false, needs_reauth: true, sync_enabled: true, last_sync_error: 'invalid_grant' });
    renderSettings();

    expect(await screen.findByText('settings:googleCalendar.reconnectNeeded')).toBeInTheDocument();
    expect(screen.getByText('settings:googleCalendar.reconnectButton')).toBeInTheDocument();
    expect(screen.queryByText('settings:googleCalendar.connected')).not.toBeInTheDocument();
  });

  it('shows when it last synced and the last sync error', async () => {
    backend({
      connected: true,
      needs_reauth: false,
      sync_enabled: true,
      last_sync: '2026-10-20 08:00:00',
      last_sync_error: 'Google Calendar API error 500',
    });
    renderSettings();

    expect(await screen.findByText(/settings:googleCalendar.lastSynced/)).toBeInTheDocument();
    expect(screen.getByText('settings:googleCalendar.lastSyncFailed')).toBeInTheDocument();
  });

  it('Sync now reports how many events failed', async () => {
    backend(
      { connected: true, needs_reauth: false, sync_enabled: true },
      { items_synced: 3, items_failed: 2, status: 'partial' },
    );
    renderSettings();

    fireEvent.click(await screen.findByText('settings:googleCalendar.syncNowButton'));

    await waitFor(() => expect(document.body.textContent).toContain('settings:googleCalendar.messages.syncPartial'));
    expect(document.body.textContent).not.toContain('settings:googleCalendar.messages.manualSyncStarted');
  });
});
