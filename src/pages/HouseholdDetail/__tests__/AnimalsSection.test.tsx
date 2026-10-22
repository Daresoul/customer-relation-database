import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createPatient = vi.fn();
vi.mock('../../../services/patientService', () => ({
  PatientService: { createPatient: (...a: unknown[]) => createPatient(...a) },
}));

const outcome: { error?: unknown; settled?: boolean } = {};
vi.mock('../../../components/forms/PatientFormWithOwner', () => ({
  default: ({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) => (
    <button
      onClick={() =>
        onSubmit({ name: 'Bella' }).then(
          () => {
            outcome.settled = true;
          },
          (e) => {
            outcome.error = e;
            outcome.settled = true;
          },
        )
      }
    >
      stub-submit
    </button>
  ),
}));

import { AnimalsSection } from '../AnimalsSection';

function renderSection(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>
          <AnimalsSection patients={[]} householdId={12} />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AnimalsSection add pet', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    outcome.error = undefined;
    outcome.settled = false;
    document.body.innerHTML = '';
  });

  it('hands a failed save back to the form instead of reporting success', async () => {
    createPatient.mockRejectedValue(new Error('Microchip 123 is already registered to another patient: Max'));
    renderSection();

    fireEvent.click(screen.getAllByText('detail.animals.registerNewPet')[0]);
    fireEvent.click(await screen.findByText('stub-submit'));

    await waitFor(() => expect(outcome.settled).toBe(true));
    expect(outcome.error).toBeInstanceOf(Error);
    expect(document.body.textContent).not.toContain('detail.animals.patientCreated');
    expect(screen.getByText('stub-submit')).toBeInTheDocument();
  });
});
