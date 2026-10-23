/**
 * settings.md #14: a failed automatic update check was only logged; the
 * Updates page looked as if all was fine.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('2.3.0') }));
vi.mock('../../../hooks/useUpdater', () => ({ useUpdater: () => ({ checkForUpdates: vi.fn(), status: 'idle' }) }));

const failure = vi.hoisted(() => ({ value: null as null | { at: number; message: string } }));
vi.mock('../../../services/updateService', () => ({
  updateService: {
    getPreferences: () => Promise.resolve({ autoCheckEnabled: true, lastCheckTimestamp: 1_700_000_000 }),
    lastCheckFailure: () => failure.value,
  },
  createBackupFailedConfirm: vi.fn(),
}));

import { UpdateSettings } from '../UpdateSettings';

function renderPage() {
  return render(
    <App>
      <UpdateSettings />
    </App>,
  );
}

describe('UpdateSettings last check', () => {
  afterEach(() => {
    cleanup();
    failure.value = null;
  });

  it('says when the last automatic check failed', async () => {
    failure.value = { at: Date.parse('2026-10-20T08:30:00'), message: 'network unreachable' };
    renderPage();
    expect(await screen.findByText('updates.lastCheckFailed')).toBeInTheDocument();
  });

  it('says nothing about failures when the last check worked', async () => {
    renderPage();
    await screen.findByText(/updates.currentVersion/);
    expect(screen.queryByText('updates.lastCheckFailed')).not.toBeInTheDocument();
  });
});
