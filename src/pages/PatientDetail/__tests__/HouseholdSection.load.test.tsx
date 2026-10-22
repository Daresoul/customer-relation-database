import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

const patient = { id: 3, name: 'Rex', householdId: 8 };
vi.mock('../../../services/patientService', () => ({
  PatientService: {
    getPatient: vi.fn(async () => patient),
    findPatient: vi.fn(async () => patient),
    updatePatientHousehold: vi.fn(),
  },
}));
const getHouseholdWithPeople = vi.fn();
vi.mock('../../../services/householdService', () => ({
  getHouseholdWithPeople: (...a: unknown[]) => getHouseholdWithPeople(...a),
}));
vi.mock('../../../components/forms/CreateHouseholdInline', () => ({ CreateHouseholdInline: () => null }));

import { usePatientDetail } from '../../../hooks/usePatient';
import { HouseholdSection } from '../HouseholdSection';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("patient's household", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('flags a failed owner load instead of returning the patient as unassigned', async () => {
    getHouseholdWithPeople.mockRejectedValue(new Error('database is locked'));
    const { result } = renderHook(() => usePatientDetail(3), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data!.householdLoadFailed).toBe(true);
  });

  it('shows "could not load owner" with Retry, and no assign picker, when the load failed', () => {
    const onRetry = vi.fn();
    render(<HouseholdSection patientId={3} loadFailed onRetry={onRetry} />, { wrapper });

    expect(screen.getByText('detail.householdInfo.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('detail.householdInfo.assign')).not.toBeInTheDocument();
    expect(screen.queryByText('detail.householdInfo.noHousehold')).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('get_all_households', expect.anything());

    fireEvent.click(screen.getByText('common:retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
