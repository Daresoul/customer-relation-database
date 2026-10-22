import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { useCreateMedicalRecord, useUpdateMedicalRecord } from '../useMedicalRecords';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/services/medicalService', () => ({
  MedicalService: {
    createMedicalRecord: (...args: unknown[]) => createMock(...args),
    updateMedicalRecord: (...args: unknown[]) => updateMock(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
});
afterEach(cleanup);

const saved = (pdfs: unknown[]) => ({ id: 7, patientId: 3, name: 'Visit', pdfs });

describe('saving a record reports each document', () => {
  it('warns about a failed document and retries just that one', async () => {
    createMock.mockResolvedValue(
      saved([
        { kind: 'report', ok: true, error: null },
        { kind: 'invoice', ok: false, error: 'Java not found' },
      ]),
    );
    invokeMock.mockResolvedValue({ kind: 'invoice', ok: true, error: null });
    const { result } = renderHook(() => useCreateMedicalRecord(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, recordType: 'note', name: 'Visit', description: 'x' });
    });

    expect(await screen.findByText('medical:documents.someFailed')).toBeInTheDocument();
    expect(screen.getByText(/medical:documents\.kinds\.invoice/)).toBeInTheDocument();
    expect(screen.queryByText('medical:messages.createSuccess')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'medical:actions.retry' }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('regenerate_record_document', { recordId: 7, kind: 'invoice' }),
    );
    expect(await screen.findByText('medical:documents.retrySucceeded')).toBeInTheDocument();
  });

  it('retries a lab report through the lab report command', async () => {
    updateMock.mockResolvedValue(saved([{ kind: 'device_report', ok: false, error: 'timed out' }]));
    invokeMock.mockResolvedValue({ id: 99 });
    const { result } = renderHook(() => useUpdateMedicalRecord(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ recordId: 7, updates: { name: 'Visit' } });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'medical:actions.retry' }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('regenerate_pdf_from_medical_record', { medicalRecordId: 7 }),
    );
  });

  it('shows a plain success when every document was made', async () => {
    updateMock.mockResolvedValue(saved([{ kind: 'report', ok: true, error: null }]));
    const { result } = renderHook(() => useUpdateMedicalRecord(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ recordId: 7, updates: { name: 'Visit' } });
    });

    expect(await screen.findByText('medical:messages.updateSuccess')).toBeInTheDocument();
    expect(screen.queryByText('medical:documents.someFailed')).not.toBeInTheDocument();
  });
});
