import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createAppointment = vi.fn();
const updateAppointment = vi.fn();
vi.mock('../../services/appointmentService', () => ({
  default: {
    getAppointments: vi.fn().mockResolvedValue({ appointments: [], total: 0, hasMore: false }),
    createAppointment: (...a: unknown[]) => createAppointment(...a),
    updateAppointment: (...a: unknown[]) => updateAppointment(...a),
  },
}));

import { useAppointments } from '../useAppointments';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

const filter = {};

describe('useAppointments saves', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('create rejects when the backend refuses', async () => {
    createAppointment.mockRejectedValue(new Error('overlap'));
    const { result } = renderHook(() => useAppointments(filter), { wrapper });

    await expect(result.current.createAppointment({} as never)).rejects.toThrow('overlap');
  });

  it('update rejects when the backend refuses', async () => {
    updateAppointment.mockRejectedValue(new Error('gone'));
    const { result } = renderHook(() => useAppointments(filter), { wrapper });

    await expect(result.current.updateAppointment({ id: 1, input: {} as never })).rejects.toThrow('gone');
  });

  it('create resolves after the backend confirms, leaving the success message to the caller', async () => {
    createAppointment.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useAppointments(filter), { wrapper });

    await act(async () => {
      await result.current.createAppointment({} as never);
    });
    expect(document.body.textContent).not.toContain('Appointment Created');
  });
});
