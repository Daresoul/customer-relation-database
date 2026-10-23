/**
 * Choosing a backup folder or making a backup updates the header's backup
 * light at once; it kept saying "backups are not set up".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { BACKUP_CONFIG_KEY } from '../../../components/AppHeader/backupHealth';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, d?: unknown) => (typeof d === 'string' ? d : key) }) }));
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api/dialog', () => ({ open: vi.fn().mockResolvedValue('C:\\Backups') }));

import BackupSettings from '../components/BackupSettings';

afterEach(cleanup);

function renderPage() {
  const client = new QueryClient();
  client.setQueryData(BACKUP_CONFIG_KEY, {});
  render(
    <QueryClientProvider client={client}>
      <App>
        <BackupSettings />
      </App>
    </QueryClientProvider>,
  );
  return client;
}

describe('backup settings and the header light', () => {
  it('a chosen folder reaches the header', async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'set_backup_directory' ? { directory: 'C:\\Backups' } : {},
    );
    const client = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /chooseDir|Choose|Избери/i }));
    await waitFor(() => expect(client.getQueryData(BACKUP_CONFIG_KEY)).toEqual({ directory: 'C:\\Backups' }));
  });

  it('a backup made now reaches the header', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_backup_config') return { directory: 'C:\\Backups' };
      if (cmd === 'run_backup_now') return { directory: 'C:\\Backups', lastBackupAt: '2026-10-23T12:00:00Z' };
      return {};
    });
    const client = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Backup now/ }));
    await waitFor(() =>
      expect(client.getQueryData(BACKUP_CONFIG_KEY)).toEqual({ directory: 'C:\\Backups', lastBackupAt: '2026-10-23T12:00:00Z' }),
    );
  });
});
