import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const updatePerson = vi.fn();
vi.mock('../../../hooks/useHousehold', () => ({
  useUpdatePerson: () => ({ mutateAsync: updatePerson, isPending: false }),
  useDeletePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePersonContacts: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const setPrimaryPerson = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: { setPrimaryPerson: (...a: unknown[]) => setPrimaryPerson(...a) },
}));

import { PersonCard } from '../PeopleSection/PersonCard';

const person = (isPrimary: boolean) => ({ id: 12, firstName: 'Ана', lastName: 'Петровска', isPrimary, contacts: [] });

function renderCard(isPrimary: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <PersonCard person={person(isPrimary)} householdId={4} canDelete />
      </App>
    </QueryClientProvider>,
  );
}

describe('PersonCard primary contact', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('Make primary makes this person the one primary contact', async () => {
    setPrimaryPerson.mockResolvedValue(undefined);
    renderCard(false);

    fireEvent.click(screen.getByText('detail.people.makePrimary'));

    await waitFor(() => expect(setPrimaryPerson).toHaveBeenCalledWith(12));
  });

  it('the primary person has no Make primary button', () => {
    renderCard(true);

    expect(screen.queryByText('detail.people.makePrimary')).not.toBeInTheDocument();
  });

  it('editing a person no longer offers a Yes/No primary switch', () => {
    renderCard(false);

    fireEvent.click(screen.getByText('common:actions.edit'));

    expect(screen.queryByText('detail.people.modal.labels.primaryContact')).not.toBeInTheDocument();
  });
});
