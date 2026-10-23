import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { useUpdatePatient } from '../usePatient';

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

describe('useUpdatePatient', () => {
  it('saves a field quietly, without a success toast each time', async () => {
    invokeMock.mockResolvedValue({ id: 3, name: 'Rex', isActive: true });
    const { result } = renderHook(() => useUpdatePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, updates: { color: 'Brown' } });
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(document.body.textContent).not.toContain('patients:messages.updatedTitle');
  });
});
