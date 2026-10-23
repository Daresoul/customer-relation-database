import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import MedicalRecordModal from '../MedicalRecordModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => ({ data: undefined, isLoading: false, isError: false }),
  useCreateMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useUpdateMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../MedicalRecordForm', () => ({
  default: ({ onDirtyChange, onCancel }: { onDirtyChange?: (d: boolean) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onDirtyChange?.(true)}>type something</button>
      <button onClick={onCancel}>form cancel</button>
    </div>
  ),
}));

afterEach(cleanup);

// In a data router, with a link outside the dialog like the app header's.
function renderModal() {
  const onClose = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: '/patients/3',
        element: (
          <>
            <Link to="/settings">header link</Link>
            <MedicalRecordModal open onClose={onClose} patientId={3} patientName="Rex" recordId={null} />
          </>
        ),
      },
      { path: '/settings', element: <div>settings page</div> },
    ],
    { initialEntries: ['/patients/3'] },
  );
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
  return { onClose, router };
}

const closeX = () => screen.getByRole('button', { name: /close/i });

describe('MedicalRecordModal: unsaved changes', () => {
  it('closes at once when nothing was typed', () => {
    const { onClose } = renderModal();
    fireEvent.click(closeX());
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before throwing away typed text, and stays open on "keep editing"', async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText('type something'));

    fireEvent.click(closeX());

    expect(await screen.findByText('medical:unsaved.title')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'medical:unsaved.keepEditing' }));
    await waitFor(() => expect(screen.queryByText('medical:unsaved.title')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes after the user confirms the discard (form Cancel too)', async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText('type something'));

    fireEvent.click(screen.getByText('form cancel'));
    fireEvent.click(await screen.findByRole('button', { name: 'medical:unsaved.discard' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('asks before a link elsewhere in the app drops typed text', async () => {
    const { router } = renderModal();
    fireEvent.click(screen.getByText('type something'));

    fireEvent.click(screen.getByText('header link'));

    expect(await screen.findByText('medical:unsaved.title')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/patients/3');
  });

  it('does not close on a click outside the dialog', () => {
    const { onClose } = renderModal();
    const wrap = document.querySelector('.ant-modal-wrap') as HTMLElement;
    fireEvent.mouseDown(wrap);
    fireEvent.mouseUp(wrap);
    fireEvent.click(wrap);
    expect(onClose).not.toHaveBeenCalled();
  });
});
