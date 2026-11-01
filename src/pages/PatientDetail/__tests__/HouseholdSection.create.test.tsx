import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));
const invokeMock = vi.fn(async (cmd: string) =>
  cmd === 'get_all_households' ? [{ household: { id: 42, householdName: 'Petrovski' }, people: [] }] : null,
);
vi.mock('@/services/invoke', () => ({ invoke: (cmd: string) => invokeMock(cmd) }));
const updatePatientHousehold = vi.fn();
vi.mock('../../../services/patientService', () => ({ PatientService: { updatePatientHousehold: (...a: unknown[]) => updatePatientHousehold(...a) } }));
vi.mock('../../../components/forms/CreateHouseholdInline', () => ({
  CreateHouseholdInline: ({ onCreated }: { onCreated: (h: { id: number }) => Promise<void> }) => (
    <button onClick={() => onCreated({ id: 42 })}>stub-create</button>
  ),
}));

import { HouseholdSection } from '../HouseholdSection';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Final review (low): when linking the new household failed, the form reset
// and staff created a second household; the first stayed without pets.
describe('create and assign', () => {
  it('after a failed link, offers to assign the household just made instead of making another', async () => {
    updatePatientHousehold.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValueOnce(undefined);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <App>
            <HouseholdSection household={null} patientId={3} />
          </App>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText('detail.householdInfo.createNew'));
    fireEvent.click(await screen.findByText('stub-create'));
    await screen.findByText('detail.householdInfo.assignFailed');

    const assign = (await screen.findByText('detail.householdInfo.assign')).closest('button') as HTMLButtonElement;
    await waitFor(() => expect(assign).not.toBeDisabled());
    fireEvent.click(assign);

    await waitFor(() => expect(updatePatientHousehold).toHaveBeenCalledTimes(2));
    expect(updatePatientHousehold).toHaveBeenLastCalledWith(3, 42);
  });
});
