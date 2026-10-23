import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? [key, ...Object.entries(opts).filter(([k]) => k !== 'defaultValue').map(([k, v]) => `${k}=${v}`)].join(' ') : key,
  }),
}));
vi.mock('@/services/labInboxService', () => ({ labInboxService: { countWaiting: mocks.count } }));

import LabInboxBadge from '../LabInboxBadge';

function renderBadge() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LabInboxBadge />} />
          <Route path="/lab-inbox" element={<div>inbox page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => mocks.count.mockReset());

describe('LabInboxBadge', () => {
  it('says how many lab results are waiting and opens the inbox', async () => {
    mocks.count.mockResolvedValue(3);
    renderBadge();

    await userEvent.click(await screen.findByRole('button', { name: /devices:inbox.badge count=3/ }));

    expect(await screen.findByText('inbox page')).toBeInTheDocument();
  });

  it('shows nothing when no result is waiting', async () => {
    mocks.count.mockResolvedValue(0);
    renderBadge();

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not claim zero when the count fails', async () => {
    mocks.count.mockRejectedValue(new Error('db'));
    renderBadge();

    expect(await screen.findByRole('button', { name: /devices:inbox.badgeUnknown/ })).toBeInTheDocument();
  });
});
