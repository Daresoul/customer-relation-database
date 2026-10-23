import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import type { MedicalRecord } from '@/types/medical';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useArchiveMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useDownloadAttachment: () => ({ mutateAsync: vi.fn() }),
  useCurrencies: () => ({ data: [] }),
}));
vi.mock('@/components/MedicalRecordDetail/MedicalRecordDetailDrawer', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));

import MedicalRecordCards from '../MedicalHistory/MedicalRecordCards';

const record = {
  id: 5,
  patientId: 3,
  recordType: 'procedure',
  name: 'Dental cleaning',
  description: 'Scaling',
  isArchived: false,
  version: 1,
  createdAt: '2026-03-03T10:05:00',
  updatedAt: '2026-03-04T11:30:00',
  attachments: [{ id: 9, originalName: 'report.pdf', mimeType: 'application/pdf', attachmentType: 'generated_pdf' }],
} as unknown as MedicalRecord;

function renderCards(onNavigateToRecord = vi.fn()) {
  const router = createMemoryRouter(
    [
      { path: '/patients/:id', element: <MedicalRecordCards records={[record]} onRefresh={vi.fn()} patientId={3} onNavigateToRecord={onNavigateToRecord} /> },
      { path: '/medical-records/:id', element: <div>record page</div> },
    ],
    { initialEntries: ['/patients/3'] },
  );
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
  return { router, onNavigateToRecord };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('MedicalRecordCards', () => {
  it('names a procedure once, in the card title', () => {
    renderCards();
    expect(screen.getAllByText('Dental cleaning')).toHaveLength(1);
  });

  it('shows created and updated times in the app date format', () => {
    renderCards();
    expect(screen.getByText('03/03/2026 10:05')).toBeInTheDocument();
    expect(screen.getByText('04/03/2026 11:30')).toBeInTheDocument();
  });

  it('opens a PDF with one navigation that names the attachment', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { router, onNavigateToRecord } = renderCards();

    fireEvent.click(screen.getByText('report.pdf'));
    vi.advanceTimersByTime(200);
    vi.useRealTimers();

    expect(onNavigateToRecord).toHaveBeenCalledTimes(1);
    expect(onNavigateToRecord).toHaveBeenCalledWith(5, 9);
    expect(router.state.location.pathname).toBe('/patients/3');
  });
});
