/**
 * The update notification shows the first line of the release notes.
 * Tauri's updater hands them over as `manifest.body`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App, Button } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mocks = vi.hoisted(() => ({ checkUpdate: vi.fn(), invoke: vi.fn() }));

vi.mock('@tauri-apps/api/updater', () => ({
  checkUpdate: mocks.checkUpdate,
  installUpdate: vi.fn(),
  onUpdaterEvent: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('@tauri-apps/api/process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn().mockResolvedValue('1.3.0') }));
vi.mock('@/services/invoke', () => ({ invoke: mocks.invoke }));

import { useUpdater } from '../useUpdater';
import { UpdateSettings } from '../../pages/Settings/UpdateSettings';

beforeEach(() => {
  mocks.checkUpdate.mockReset();
  mocks.checkUpdate.mockResolvedValue({
    shouldUpdate: true,
    manifest: { version: '1.4.0', date: '2026-10-20', body: 'Lab results open faster\nSmaller fixes' },
  });
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (command: string) =>
    command === 'get_update_preferences'
      ? { id: 1, auto_check_enabled: true, last_check_timestamp: null, last_notified_version: null }
      : null,
  );
});

function StartupCheck() {
  const { checkForUpdates } = useUpdater();
  return <Button onClick={() => checkForUpdates()}>check</Button>;
}

describe('update notes in the update notification', () => {
  it('the startup check shows the first line of the release notes', async () => {
    render(
      <App>
        <StartupCheck />
      </App>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'check' }));
    expect(await screen.findByText('Lab results open faster')).toBeInTheDocument();
    expect(screen.queryByText('updates.newVersionAvailable')).not.toBeInTheDocument();
  });

  it('the manual check in Settings shows the first line of the release notes', async () => {
    render(
      <App>
        <UpdateSettings />
      </App>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'updates.checkForUpdates' }));
    expect(await screen.findByText(/Lab results open faster/)).toBeInTheDocument();
    expect(screen.queryByText(/updates\.newVersionAvailable/)).not.toBeInTheDocument();
  });
});
