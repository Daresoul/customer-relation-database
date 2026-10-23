import React from 'react';
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

import { AppShellHeader, GlobalSearchProvider } from '..';

function renderHeader(props: React.ComponentProps<typeof AppShellHeader> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <GlobalSearchProvider>
            <AppShellHeader {...props} />
            <input aria-label="a form field" />
          </GlobalSearchProvider>
        ),
      },
    ],
    { initialEntries: ['/patients/4'] },
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

const palette = () => screen.queryByPlaceholderText('shell:search.placeholder');

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ directory: 'D:/b', lastBackupAt: new Date().toISOString(), lastError: null });
});
afterEach(cleanup);

describe('app header', () => {
  it('the app name goes to the dashboard', async () => {
    const router = renderHeader();
    fireEvent.click(screen.getByText('shell:header.appName'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('Settings is always there and opens Settings', async () => {
    const router = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /shell:header.settings/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it('the search button opens the patient search', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /shell:header.searchButton/ }));
    expect(await screen.findByPlaceholderText('shell:search.placeholder')).toBeInTheDocument();
  });

  it.each([
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['Cmd+K', { key: 'k', metaKey: true }],
    ['/', { key: '/' }],
  ])('%s opens the patient search from anywhere', async (_name, keys) => {
    renderHeader();
    fireEvent.keyDown(document.body, keys);
    expect(await screen.findByPlaceholderText('shell:search.placeholder')).toBeInTheDocument();
  });

  it('"/" typed into a text field stays a slash', async () => {
    renderHeader();
    const field = screen.getByLabelText('a form field');
    field.focus();
    fireEvent.keyDown(field, { key: '/' });
    await new Promise((r) => setTimeout(r, 50));
    expect(palette()).not.toBeInTheDocument();
  });

  it('Ctrl+K works even while typing in a field', async () => {
    renderHeader();
    const field = screen.getByLabelText('a form field');
    field.focus();
    fireEvent.keyDown(field, { key: 'k', ctrlKey: true });
    expect(await screen.findByPlaceholderText('shell:search.placeholder')).toBeInTheDocument();
  });

  it('shows the backup light and the status slots it is given', async () => {
    renderHeader({ labInboxSlot: <span>3 lab results</span>, deviceStatusSlot: <span>devices ok</span> });
    expect(screen.getByText('3 lab results')).toBeInTheDocument();
    expect(screen.getByText('devices ok')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /shell:backup.label/ })).toBeInTheDocument();
  });
});
