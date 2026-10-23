import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: () => Promise.resolve({ id: 55 }) }));

import { useCreateMedicalRecord, CREATE_RECORD_MUTATION_KEY } from '../useMedicalRecords';

describe('creating a record', () => {
  it('runs under a known mutation key, so the appointment panel can link the new record', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <App>{children}</App>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateMedicalRecord(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 21, recordType: 'note', name: 'Consult' } as never).catch(() => {});
    });

    expect(client.getMutationCache().findAll({ mutationKey: [...CREATE_RECORD_MUTATION_KEY] })).toHaveLength(1);
  });
});
