import type React from 'react';
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
vi.mock('@/components/AppointmentDrawer/AppointmentDrawer', () => ({
  AppointmentDrawer: ({ appointmentId }: { appointmentId: number | null }) =>
    appointmentId ? <div>stub-panel-{appointmentId}</div> : null,
}));

import { TodayStrip } from '../TodayStrip';

const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const appointments = [
  { id: 2, patient_id: 21, title: 'Vaccination', start_time: at(10, 30), end_time: at(11), status: 'scheduled', patient_name: 'Шарко' },
  { id: 1, patient_id: 20, title: 'Check-up', start_time: at(9, 15), end_time: at(9, 45), status: 'in_progress', patient_name: 'Bella' },
];

function backend(overrides: Record<string, () => Promise<unknown>> = {}) {
  invokeMock.mockImplementation((cmd: string) => {
    if (overrides[cmd]) return overrides[cmd]();
    if (cmd === 'get_appointments') return Promise.resolve({ appointments, total: 2, has_more: false });
    if (cmd === 'count_patients_seen') return Promise.resolve(4);
    return Promise.resolve(null);
  });
}

function renderStrip(props: Partial<React.ComponentProps<typeof TodayStrip>> = {}) {
  const onOpenLabResults = vi.fn();
  const router = createMemoryRouter(
    [{ path: '*', element: <TodayStrip waitingLabCount={3} onOpenLabResults={onOpenLabResults} {...props} /> }],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return { router, onOpenLabResults };
}

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(cleanup);

describe('Today strip', () => {
  it("lists today's appointments in time order with time, patient and status", async () => {
    backend();
    renderStrip();

    const bella = await screen.findByText('Bella');
    const sharko = screen.getByText('Шарко');
    expect(bella.compareDocumentPosition(sharko) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('09:15')).toBeInTheDocument();
    expect(screen.getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText('appointments:status.inProgress')).toBeInTheDocument();
    expect(screen.getByText('appointments:status.scheduled')).toBeInTheDocument();
  });

  it("asks for today's appointments only", async () => {
    backend();
    renderStrip();
    await screen.findByText('Bella');

    const call = invokeMock.mock.calls.find((c) => c[0] === 'get_appointments');
    const filter = (call?.[1] as { filter: { start_date: string; end_date: string } }).filter;
    const start = new Date(filter.start_date);
    const end = new Date(filter.end_date);
    expect(start.getHours()).toBe(0);
    expect(start.toDateString()).toBe(new Date().toDateString());
    // Same calendar day (a day with a clock change is 23 or 25 hours long).
    expect(end.toDateString()).toBe(start.toDateString());
  });

  it('opens the appointment panel from an appointment (Open patient lives there)', async () => {
    backend();
    const { router } = renderStrip();

    fireEvent.click(await screen.findByText('Шарко'));

    expect(await screen.findByText('stub-panel-2')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('says when there are no appointments today', async () => {
    backend({ get_appointments: () => Promise.resolve({ appointments: [], total: 0, has_more: false }) });
    renderStrip();
    expect(await screen.findByText('shell:today.noAppointments')).toBeInTheDocument();
  });

  it('shows a failed load as an error, not as an empty day', async () => {
    backend({ get_appointments: () => Promise.reject(new Error('database is locked')) });
    renderStrip();
    expect(await screen.findByText('shell:today.appointmentsFailed')).toBeInTheDocument();
    expect(screen.queryByText('shell:today.noAppointments')).not.toBeInTheDocument();
  });

  it('shows the waiting lab results and opens them on click', async () => {
    backend();
    const { onOpenLabResults } = renderStrip({ waitingLabCount: 3 });

    const tile = await screen.findByRole('button', { name: /shell:today.labWaiting/ });
    expect(tile).toHaveTextContent('3');
    fireEvent.click(tile);
    expect(onOpenLabResults).toHaveBeenCalled();
  });

  it('shows how many patients were seen today, counted over the local day', async () => {
    backend();
    renderStrip();

    await waitFor(() => expect(screen.getByTestId('seen-today')).toHaveTextContent('4'));
    const call = invokeMock.mock.calls.find((c) => c[0] === 'count_patients_seen');
    const { start, end } = call?.[1] as { start: string; end: string };
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(end).getTime() - new Date(start).getTime()).toBeGreaterThanOrEqual(23 * 3600_000);
  });
});
