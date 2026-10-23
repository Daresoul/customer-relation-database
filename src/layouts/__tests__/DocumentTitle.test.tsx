/**
 * app-shell #17: every window and taskbar entry said the same thing, so
 * staff could not tell the patient window from Settings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o?.page !== undefined ? `${key}|${o.page}` : key),
  }),
}));

import { DocumentTitle } from '../DocumentTitle';

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <DocumentTitle />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <div />, handle: { titleKey: 'shell:pageTitle.dashboard' } },
          { path: '/settings', element: <div />, handle: { titleKey: 'shell:pageTitle.settings' } },
          { path: '/plain', element: <div /> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
}

describe('DocumentTitle', () => {
  afterEach(cleanup);

  it('names the page after the app', async () => {
    renderAt('/settings');
    await waitFor(() => expect(document.title).toBe('shell:pageTitle.format|shell:pageTitle.settings'));
  });

  it('falls back to the app name on a page without a title', async () => {
    renderAt('/plain');
    await waitFor(() => expect(document.title).toBe('shell:header.appName'));
  });
});
