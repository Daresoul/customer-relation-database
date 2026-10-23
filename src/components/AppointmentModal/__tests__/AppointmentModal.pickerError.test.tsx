/**
 * frontend-data #9: when the patients failed to load, the picker said
 * there was nothing to pick.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/usePatients', () => ({
  usePatients: () => ({ patients: [], error: 'database is locked' }),
}));
vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('@/services/invoke', () => ({ invoke: () => Promise.resolve([]) }));
vi.mock('../../../services/appointmentService', () => ({
  default: { checkConflicts: vi.fn(), generateTimeSlots: () => [] },
}));

import AppointmentModal from '../AppointmentModal';

describe('AppointmentModal patient picker', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('says the patients could not be loaded', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <AppointmentModal open mode="create" onCancel={vi.fn()} onSave={vi.fn()} rooms={[]} />
        </App>
      </QueryClientProvider>,
    );

    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);

    expect(await screen.findByText('common:pickerLoadFailed')).toBeInTheDocument();
  });
});
