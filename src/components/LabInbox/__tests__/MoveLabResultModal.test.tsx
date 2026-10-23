import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  move: vi.fn(),
  records: {} as Record<number, Array<Record<string, unknown>>>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, a?: unknown, b?: unknown) => {
      const opts = (typeof a === 'object' && a) || (typeof b === 'object' && b) || undefined;
      if (!opts) return key;
      const vars = Object.entries(opts as Record<string, unknown>)
        .filter(([k]) => k !== 'defaultValue')
        .map(([k, v]) => `${k}=${v}`);
      return [key, ...vars].join(' ');
    },
  }),
}));
vi.mock('@/services/labInboxService', () => ({ labInboxService: { move: mocks.move } }));
vi.mock('@/hooks/usePatients', () => ({
  usePatients: () => ({
    patients: [
      { id: 3, name: 'Max', species: 'Dog' },
      { id: 7, name: 'Koko', species: 'Dog', microchipId: '807010000004471' },
    ],
    refreshPatients: vi.fn(),
    loading: false,
  }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecords: (patientId: number) => ({
    data: patientId ? { records: mocks.records[patientId] ?? [] } : undefined,
    isLoading: false,
    isError: false,
  }),
}));

import MoveLabResultModal from '../MoveLabResultModal';

const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * 86400_000).toISOString();

function renderModal(onMoved = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MoveLabResultModal open attachmentId={500} fileName="BM-53672_1219.xml" currentPatientId={3} onClose={onClose} onMoved={onMoved} />
      </AntApp>
    </QueryClientProvider>,
  );
  return { onMoved, onClose };
}

async function pickPatient(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByTestId('move-patient-select').querySelector('input') as HTMLElement);
  await user.click(await screen.findByText(name, { selector: '.ant-select-item-option-content' }));
}

beforeEach(() => {
  mocks.move.mockReset().mockResolvedValue({ attachmentId: 900, fromRecordId: 40, toRecordId: 61, pdfs: [{ kind: 'device_report', ok: true }] });
  mocks.records = {
    7: [
      { id: 60, name: 'Vaccination', recordType: 'procedure', createdAt: daysAgo(10), isArchived: false },
      { id: 61, name: 'Consult', recordType: 'procedure', createdAt: daysAgo(0), isArchived: false },
      { id: 62, name: 'Old', recordType: 'note', createdAt: daysAgo(3), isArchived: true },
    ],
  };
});

describe('MoveLabResultModal', () => {
  it("lists the chosen patient's records newest first and picks today's", async () => {
    const user = userEvent.setup();
    renderModal();

    await pickPatient(user, /Koko/);

    const select = await screen.findByTestId('record-select');
    await waitFor(() => expect(within(select).getByText(/Consult/)).toBeInTheDocument());
    await user.click(select.querySelector('input') as HTMLElement);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options.findIndex((o) => o?.includes('Consult'))).toBeLessThan(options.findIndex((o) => o?.includes('Vaccination')));
    expect(options.some((o) => o?.includes('Old'))).toBe(false);
  });

  it('moves the result to the picked record and reports it after the backend confirms', async () => {
    const user = userEvent.setup();
    const { onMoved } = renderModal();

    await pickPatient(user, /Koko/);
    await waitFor(() => expect(within(screen.getByTestId('record-select')).getByText(/Consult/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /devices:inbox.moveConfirm/ }));

    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith(500, 61));
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith(expect.objectContaining({ toRecordId: 61 })));
    expect(await screen.findByText('devices:inbox.moved')).toBeInTheDocument();
  });

  it('warns when the lab report could not be rebuilt', async () => {
    const user = userEvent.setup();
    mocks.move.mockResolvedValue({ attachmentId: 900, fromRecordId: 40, toRecordId: 61, pdfs: [{ kind: 'device_report', ok: false, error: 'java' }] });
    renderModal();

    await pickPatient(user, /Koko/);
    await waitFor(() => expect(within(screen.getByTestId('record-select')).getByText(/Consult/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /devices:inbox.moveConfirm/ }));

    expect(await screen.findByText('devices:inbox.movedPdfFailed')).toBeInTheDocument();
  });

  it('cannot move to the patient the result is already on', async () => {
    const user = userEvent.setup();
    mocks.records[3] = [{ id: 40, name: 'Max bloods', recordType: 'test_result', createdAt: daysAgo(0), isArchived: false }];
    renderModal();

    await pickPatient(user, /Max/);

    expect(await screen.findByText('devices:inbox.samePatient')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /devices:inbox.moveConfirm/ })).toBeDisabled();
  });

  it('keeps the dialog open and says why when the move fails', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    mocks.move.mockRejectedValue('Medical record not found');

    await pickPatient(user, /Koko/);
    await waitFor(() => expect(within(screen.getByTestId('record-select')).getByText(/Consult/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /devices:inbox.moveConfirm/ }));

    expect(await screen.findByText(/Medical record not found/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
