import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link, Outlet } from 'react-router-dom';
import { App } from 'antd';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

function Form({ dirty }: { dirty: boolean }) {
  const confirmLeave = useUnsavedChangesGuard(dirty);
  return (
    <div>
      <span>the form</span>
      <button onClick={() => confirmLeave(() => undefined)}>cancel edit</button>
    </div>
  );
}

/** A sidebar link lives outside the form, like the header or the breadcrumbs. */
function Shell() {
  return (
    <div>
      <Link to="/elsewhere">sidebar link</Link>
      <Outlet />
    </div>
  );
}

function renderAt(dirty: boolean) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/form', element: <Form dirty={dirty} /> },
          { path: '/elsewhere', element: <div>another page</div> },
        ],
      },
    ],
    { initialEntries: ['/form'] },
  );
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
  return router;
}

describe('useUnsavedChangesGuard', () => {
  it('lets any link leave at once when nothing is unsaved', async () => {
    renderAt(false);
    fireEvent.click(screen.getByText('sidebar link'));
    expect(await screen.findByText('another page')).toBeInTheDocument();
  });

  it('asks before any in-app navigation drops unsaved work, and leaves on Discard', async () => {
    renderAt(true);

    fireEvent.click(screen.getByText('sidebar link'));

    expect(await screen.findByText('medical:unsaved.title')).toBeInTheDocument();
    expect(screen.getByText('the form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'medical:unsaved.discard' }));
    await waitFor(() => expect(screen.getByText('another page')).toBeInTheDocument());
  });

  it('stays on the page when the user keeps editing', async () => {
    const router = renderAt(true);

    fireEvent.click(screen.getByText('sidebar link'));
    fireEvent.click(await screen.findByRole('button', { name: 'medical:unsaved.keepEditing' }));

    await waitFor(() => expect(screen.queryByText('medical:unsaved.title')).not.toBeInTheDocument());
    expect(screen.getByText('the form')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/form');
  });

  it('asks once, not twice, when a confirmed leave then navigates', async () => {
    function LeavingForm() {
      const confirmLeave = useUnsavedChangesGuard(true);
      return (
        <button onClick={() => confirmLeave(() => router.navigate('/elsewhere'))}>back</button>
      );
    }
    const router = createMemoryRouter(
      [
        { path: '/form', element: <LeavingForm /> },
        { path: '/elsewhere', element: <div>another page</div> },
      ],
      { initialEntries: ['/form'] },
    );
    render(
      <App>
        <RouterProvider router={router} />
      </App>,
    );

    fireEvent.click(screen.getByText('back'));
    fireEvent.click(await screen.findByRole('button', { name: 'medical:unsaved.discard' }));

    expect(await screen.findByText('another page')).toBeInTheDocument();
    expect(screen.queryAllByText('medical:unsaved.title').filter((el) => el.isConnected && el.closest('.ant-modal-wrap:not([style*="display: none"])'))).toHaveLength(0);
  });
});
