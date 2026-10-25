/**
 * Serial machines don't wait: results sent while Arkivet was closed are lost.
 * At start the app says when it was closed during clinic hours, once.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key) }),
}));
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { OfflineGapNotice } from '../OfflineGapNotice';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  invokeMock.mockReset();
});

describe('OfflineGapNotice', () => {
  it('says from when to when Arkivet was closed and to resend', async () => {
    const day = new Date();
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 10).toISOString();
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 40).toISOString();
    invokeMock.mockResolvedValue({ from, to });
    render(<App><OfflineGapNotice /></App>);
    expect(await screen.findByText('devices:offlineGap.title')).toBeInTheDocument();
    expect(screen.getByText(/devices:offlineGap\.body \{"from":"[^"]*12:10","to":"[^"]*12:40"\}/)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('take_offline_gap');
  });

  it('says nothing when the app was not closed in clinic hours', async () => {
    invokeMock.mockResolvedValue(null);
    render(<App><OfflineGapNotice /></App>);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByText('devices:offlineGap.title')).not.toBeInTheDocument();
  });
});
