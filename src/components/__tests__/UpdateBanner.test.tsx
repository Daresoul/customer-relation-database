/**
 * app-shell #7, settings #4: the update offer was a notification that the
 * next notification pushed out, and nothing showed the download or install.
 * The banner holds the offer and the progress until the app restarts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o?.version ? `${key} ${o.version}` : key) }),
}));

import { UpdateBanner } from '../UpdateBanner';

const manifest = { version: '2.4.0', notes: 'Faster lab import\nmore', pub_date: '', platforms: {} };

function renderBanner(props: Partial<React.ComponentProps<typeof UpdateBanner>>) {
  const onInstall = vi.fn();
  render(
    <App>
      <UpdateBanner status="idle" manifest={null} onInstall={onInstall} {...props} />
    </App>,
  );
  return onInstall;
}

describe('UpdateBanner', () => {
  afterEach(cleanup);

  it('shows nothing while there is no update', () => {
    renderBanner({ status: 'idle' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers the new version until the user installs it', () => {
    const onInstall = renderBanner({ status: 'ready', manifest });
    expect(screen.getByText('updates.updateAvailableVersion 2.4.0')).toBeInTheDocument();
    expect(screen.getByText('Faster lab import')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'updates.installAndRestart' }));
    expect(onInstall).toHaveBeenCalled();
  });

  it('says the update is downloading', () => {
    renderBanner({ status: 'downloading', manifest });
    expect(screen.getByText('updates.progress.downloading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'updates.installAndRestart' })).not.toBeInTheDocument();
  });

  it('says the update is installing and the app restarts', () => {
    renderBanner({ status: 'installing', manifest });
    expect(screen.getByText('updates.progress.installing')).toBeInTheDocument();
  });
});
