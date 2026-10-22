import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const deletePatient = vi.fn();
vi.mock('../../services/patientService', () => ({
  PatientService: { deletePatient: (...a: unknown[]) => deletePatient(...a) },
}));

import { useDeletePatient } from '../usePatient';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('useDeletePatient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('explains that a patient with history cannot be deleted', async () => {
    deletePatient.mockRejectedValue('PATIENT_HAS_HISTORY: 3 medical records, 1 appointments');
    const { result } = renderHook(() => useDeletePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(5).catch(() => {});
    });

    await waitFor(() => expect(document.body.textContent).toContain('patients:errors.deleteBlocked'));
    expect(document.body.textContent).not.toContain('PATIENT_HAS_HISTORY');
  });
});
