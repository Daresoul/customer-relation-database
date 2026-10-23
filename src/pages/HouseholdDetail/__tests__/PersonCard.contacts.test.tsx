/**
 * household #6: the preferred contact could only be seen, never set, and
 * the edit form dropped it on save. Removing a person's last contact did
 * nothing, because an empty list was never sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const updatePerson = vi.fn().mockResolvedValue(undefined);
const updateContacts = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../hooks/useHousehold', () => ({
  useUpdatePerson: () => ({ mutateAsync: updatePerson, isPending: false }),
  useDeletePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePersonContacts: () => ({ mutateAsync: updateContacts, isPending: false }),
}));
vi.mock('../../../hooks/useHouseholdActions', () => ({
  useSetPrimaryPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PersonCard } from '../PeopleSection/PersonCard';

function renderCard(contacts: Array<{ id: number; contactType: string; contactValue: string; isPrimary: boolean }>) {
  const person = { id: 12, firstName: 'Ана', lastName: 'Петровска', isPrimary: true, contacts };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <PersonCard person={person as never} householdId={4} canDelete />
      </App>
    </QueryClientProvider>,
  );
}

describe('PersonCard contacts', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('sets the preferred contact in the edit form, one at a time', async () => {
    renderCard([
      { id: 1, contactType: 'phone', contactValue: '070 123 456', isPrimary: true },
      { id: 2, contactType: 'email', contactValue: 'ana@example.com', isPrimary: false },
    ]);

    fireEvent.click(screen.getByText('common:actions.edit'));
    const switches = await screen.findAllByRole('switch', { name: 'detail.people.preferredContact' });
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(switches[1]);
    fireEvent.click(screen.getByText('common:save'));

    await waitFor(() => expect(updateContacts).toHaveBeenCalled());
    const sent = updateContacts.mock.calls[0][0].contacts;
    expect(sent.map((c: { isPrimary: boolean }) => c.isPrimary)).toEqual([false, true]);
  });

  it('removing the last contact saves an empty list', async () => {
    renderCard([{ id: 1, contactType: 'phone', contactValue: '070 123 456', isPrimary: true }]);

    fireEvent.click(screen.getByText('common:actions.edit'));
    fireEvent.click(await screen.findByRole('button', { name: 'detail.people.removeContact' }));
    fireEvent.click(screen.getByText('common:save'));

    await waitFor(() => expect(updateContacts).toHaveBeenCalled());
    expect(updateContacts.mock.calls[0][0].contacts).toEqual([]);
  });
});
