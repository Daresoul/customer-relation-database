import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { backupHealth, BackupHealthLight } from '../BackupHealthLight';

const now = new Date('2026-10-23T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

describe('backupHealth', () => {
  it('is green when the last backup is under 26 hours old', () => {
    expect(backupHealth({ directory: 'D:/b', lastBackupAt: hoursAgo(25), lastError: null }, now)).toMatchObject({
      level: 'ok',
      reason: 'ok',
    });
  });

  it('is amber when the last backup is older than 26 hours', () => {
    expect(backupHealth({ directory: 'D:/b', lastBackupAt: hoursAgo(27), lastError: null }, now)).toMatchObject({
      level: 'warn',
      reason: 'old',
    });
  });

  it('is amber when no backup folder is set', () => {
    expect(backupHealth({ directory: null, lastBackupAt: null, lastError: null }, now)).toMatchObject({
      level: 'warn',
      reason: 'notConfigured',
    });
  });

  it('is amber when a folder is set but no backup ran yet', () => {
    expect(backupHealth({ directory: 'D:/b', lastBackupAt: null, lastError: null }, now)).toMatchObject({
      level: 'warn',
      reason: 'never',
    });
  });

  it('is red when the last attempt failed, even after an older success', () => {
    expect(
      backupHealth({ directory: 'D:/b', lastBackupAt: hoursAgo(1), lastError: 'VACUUM INTO failed: disk full' }, now),
    ).toMatchObject({ level: 'failed', reason: 'failed' });
  });
});

describe('BackupHealthLight', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });
  afterEach(cleanup);

  function renderLight() {
    const router = createMemoryRouter(
      [
        { path: '/', element: <BackupHealthLight /> },
        { path: '/settings', element: <div>settings page</div> },
      ],
      { initialEntries: ['/'] },
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App>
          <RouterProvider router={router} />
        </App>
      </QueryClientProvider>,
    );
    return router;
  }

  it('shows a word next to the colour, and reads the backup config', async () => {
    invokeMock.mockResolvedValue({ directory: null, lastBackupAt: null, lastError: null });
    renderLight();

    const light = await screen.findByRole('button', { name: /shell:backup.label/ });
    await waitFor(() => expect(light).toHaveAttribute('data-level', 'warn'));
    expect(invokeMock).toHaveBeenCalledWith('get_backup_config');
  });

  it('opens Settings at the Backups section on click', async () => {
    invokeMock.mockResolvedValue({ directory: 'D:/b', lastBackupAt: new Date().toISOString(), lastError: null });
    const router = renderLight();

    fireEvent.click(await screen.findByRole('button', { name: /shell:backup.label/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(router.state.location.search).toBe('?section=backups');
  });

  it('is amber, not green, when the config cannot be read', async () => {
    invokeMock.mockRejectedValue(new Error('no app dir'));
    renderLight();

    const light = await screen.findByRole('button', { name: /shell:backup.label/ });
    await waitFor(() => expect(light).toHaveAttribute('data-level', 'warn'));
  });
});
