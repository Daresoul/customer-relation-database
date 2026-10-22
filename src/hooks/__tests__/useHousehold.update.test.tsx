import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { useUpdateHousehold } from '../useHousehold';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUpdateHousehold', () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
  });

  it('sends city and postal code', async () => {
    invokeMock.mockResolvedValue(null);
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ householdId: 5, updates: { city: 'Bitola', postalCode: '7000' } });
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'update_household',
      expect.objectContaining({ householdId: 5, city: 'Bitola', postalCode: '7000' }),
    );
  });

  it('sends an empty string to clear a field, and nothing for fields left alone', async () => {
    invokeMock.mockResolvedValue(null);
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ householdId: 5, updates: { postalCode: null as never } });
    });

    const args = invokeMock.mock.calls.find((c) => c[0] === 'update_household')![1];
    expect(args.postalCode).toBe('');
    expect(args.city).toBeUndefined();
    expect(args.address).toBeUndefined();
  });
});
