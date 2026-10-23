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

import { GlobalSearchProvider, useGlobalSearch } from '../GlobalSearchContext';
import { loadRecentPatients, rememberPatient } from '../recentPatients';

const hits = [
  { patientId: 11, patientName: 'Шарко', species: 'Dog', microchipId: '807000000123456', isActive: true, householdId: 3, ownerName: 'Ана Петровска', ownerPhone: '070 123 456' },
  { patientId: 12, patientName: 'Маца', species: 'Cat', microchipId: null, isActive: true, householdId: 3, ownerName: 'Ана Петровска', ownerPhone: '070 123 456' },
];

function Opener({ query }: { query?: string }) {
  const { openSearch } = useGlobalSearch();
  return <button onClick={() => openSearch(query)}>open search</button>;
}

function renderPalette(query?: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <GlobalSearchProvider>
            <Opener query={query} />
          </GlobalSearchProvider>
        ),
      },
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
  fireEvent.click(screen.getByText('open search'));
  return router;
}

const input = () => screen.getByPlaceholderText('shell:search.placeholder');

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === 'global_patient_search' ? hits : null));
});
afterEach(cleanup);

describe('patient search palette', () => {
  it('shows the recently viewed patients before anything is typed', async () => {
    rememberPatient({ id: 5, name: 'Rex', ownerName: 'John Smith' });
    renderPalette();

    expect(await screen.findByText('shell:search.recent')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('searches pet, chip, owner and phone through one command and shows owner and phone', async () => {
    renderPalette();
    fireEvent.change(input(), { target: { value: 'петров' } });

    expect(await screen.findByText('Шарко')).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('global_patient_search', { query: 'петров', limit: 20 });
    expect(screen.getAllByText(/Ана Петровска/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/070 123 456/).length).toBeGreaterThan(0);
  });

  it('Enter opens the top hit and remembers it', async () => {
    const router = renderPalette();
    fireEvent.change(input(), { target: { value: 'петров' } });
    await screen.findByText('Шарко');

    fireEvent.keyDown(input(), { key: 'Enter' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/11'));
    expect(loadRecentPatients()[0]).toMatchObject({ id: 11, name: 'Шарко', ownerName: 'Ана Петровска' });
  });

  it('arrow keys move the selection before Enter', async () => {
    const router = renderPalette();
    fireEvent.change(input(), { target: { value: 'петров' } });
    await screen.findByText('Маца');

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/12'));
  });

  it('a click opens that patient and closes the search', async () => {
    const router = renderPalette();
    fireEvent.change(input(), { target: { value: 'петров' } });

    fireEvent.click(await screen.findByText('Маца'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/12'));
    await waitFor(() => expect(screen.queryByPlaceholderText('shell:search.placeholder')).not.toBeInTheDocument());
  });

  it('says so when nothing matches', async () => {
    invokeMock.mockResolvedValue([]);
    renderPalette();
    fireEvent.change(input(), { target: { value: 'zzz' } });

    expect(await screen.findByText('shell:search.noResults')).toBeInTheDocument();
  });

  it('opens with a query already filled in (a chip from a scan)', async () => {
    renderPalette('807000000123456');

    expect(input()).toHaveValue('807000000123456');
    expect(await screen.findByText('Шарко')).toBeInTheDocument();
  });

  it('shows a failed search as an error, not as "no results"', async () => {
    invokeMock.mockRejectedValue(new Error('database is locked'));
    renderPalette();
    fireEvent.change(input(), { target: { value: 'rex' } });

    expect(await screen.findByText('shell:search.failed')).toBeInTheDocument();
    expect(screen.queryByText('shell:search.noResults')).not.toBeInTheDocument();
  });
});
