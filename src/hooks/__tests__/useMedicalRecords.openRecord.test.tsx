import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { useCreateMedicalRecord } from '../useMedicalRecords';

vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const createMock = vi.fn();
vi.mock('@/services/medicalService', () => ({
  MedicalService: { createMedicalRecord: (...args: unknown[]) => createMock(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe('creating a record', () => {
  it('offers to open the new record from the success message', async () => {
    createMock.mockResolvedValue({ id: 7, patientId: 3, pdfs: [{ kind: 'report', ok: true, error: null }] });
    const onOpenRecord = vi.fn();
    const { result } = renderHook(() => useCreateMedicalRecord({ onOpenRecord }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, recordType: 'note', name: 'Visit', description: 'x' });
    });

    expect(await screen.findByText('medical:messages.createSuccess')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'medical:actions.openRecord' }));
    expect(onOpenRecord).toHaveBeenCalledWith(7);
  });
});
