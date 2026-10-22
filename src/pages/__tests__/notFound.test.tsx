import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { useHouseholdDetail } from '../../hooks/useHousehold';
import { usePatientDetail } from '../../hooks/usePatient';

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

describe('unknown ids', () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
  });

  it('a household the backend does not know loads as "not found", not as an error', async () => {
    invokeMock.mockResolvedValue(null);
    const { result } = renderHook(() => useHouseholdDetail(999), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('a patient the backend does not know loads as "not found", not as an error', async () => {
    invokeMock.mockResolvedValue(null);
    const { result } = renderHook(() => usePatientDetail(999), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });
});
