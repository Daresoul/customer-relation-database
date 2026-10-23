/**
 * Attaching a machine result to a record takes it out of the lab inbox, so
 * the header's "N lab results waiting" must drop at once — not on the next
 * minute's poll or a visit to the inbox.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { useUploadAttachment } from '../useMedicalRecords';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const uploadMock = vi.fn();
vi.mock('@/services/medicalService', () => ({
  MedicalService: {
    validateFile: () => null,
    uploadAttachment: (...args: unknown[]) => uploadMock(...args),
  },
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  uploadMock.mockReset().mockResolvedValue({ id: 500 });
});

describe('attaching a machine result', () => {
  it('refreshes the lab inbox and its waiting count', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUploadAttachment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        medicalRecordId: 9,
        file: new File([new Uint8Array([1])], 'exigo.xml', { type: 'application/xml' }),
        deviceType: 'exigo_eos_vet',
        attachmentType: 'test_result',
        sourceFileId: 'file:exigo.xml:abc',
      });
    });

    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(keys).toContain('lab-inbox');
    expect(keys).toContain('lab-inbox-count');
  });
});
