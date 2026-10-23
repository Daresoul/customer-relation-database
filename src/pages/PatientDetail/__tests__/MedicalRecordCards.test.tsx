import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import MedicalRecordCards from '../MedicalHistory/MedicalRecordCards';
import type { MedicalRecord } from '@/types/medical';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useArchiveMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useDownloadAttachment: () => ({ mutateAsync: vi.fn() }),
  useCurrencies: () => ({ data: [] }),
}));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));

const record = {
  id: 7,
  patientId: 3,
  recordType: 'procedure',
  name: 'Consult',
  description: 'Notes',
  isArchived: false,
  version: 1,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
} as unknown as MedicalRecord;

describe('record card menu', () => {
  it('has Edit, which opens the record page ready to edit', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/patients/3', element: <MedicalRecordCards records={[record]} onRefresh={vi.fn()} patientId={3} /> },
        { path: '/medical-records/:id', element: <div>record page</div> },
      ],
      { initialEntries: ['/patients/3'] },
    );
    render(
      <App>
        <RouterProvider router={router} />
      </App>,
    );

    await user.click(screen.getByRole('button', { name: 'more' }));
    await user.click(await screen.findByText('actions.edit'));

    expect(await screen.findByText('record page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/medical-records/7');
    expect(router.state.location.search).toBe('?edit=1');
  });
});
