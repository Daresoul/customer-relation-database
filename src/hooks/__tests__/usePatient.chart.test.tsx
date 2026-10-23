import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import dayjs from 'dayjs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { usePatientDetail, useUpdatePatient } from '../usePatient';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  document.body.innerHTML = '';
});

describe('patient neuter status and age', () => {
  it('sends the neuter status, including "not recorded"', async () => {
    invokeMock.mockResolvedValue({ id: 3, name: 'Rex', isActive: true });
    const { result } = renderHook(() => useUpdatePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, updates: { neutered: false } });
    });
    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, updates: { neutered: null } });
    });

    expect(invokeMock).toHaveBeenCalledWith('update_patient', { id: 3, dto: { neutered: false } });
    expect(invokeMock).toHaveBeenCalledWith('update_patient', { id: 3, dto: { neutered: null } });
  });

  it("gives a puppy's age in weeks", async () => {
    invokeMock.mockResolvedValue({
      id: 3,
      name: 'Rex',
      isActive: true,
      dateOfBirth: dayjs().subtract(3, 'week').format('YYYY-MM-DD'),
    });
    const { result } = renderHook(() => usePatientDetail(3), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data!.age?.display).toBe('patients:chart.age.weeks');
  });
});
