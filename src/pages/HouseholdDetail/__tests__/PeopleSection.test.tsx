import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mutateAsync = vi.fn();
vi.mock('../../../hooks/useHousehold', () => ({
  useAddPerson: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('../PeopleSection/PersonCard', () => ({ PersonCard: () => null }));

import { PeopleSection } from '../PeopleSection';

describe('PeopleSection add person', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps the typed person when the save fails', async () => {
    mutateAsync.mockRejectedValue(new Error('locked'));
    render(
      <App>
        <PeopleSection people={[]} householdId={3} />
      </App>,
    );

    fireEvent.click(screen.getByText('detail.people.addPerson'));
    fireEvent.change(await screen.findByPlaceholderText('detail.people.modal.placeholders.firstName'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByPlaceholderText('detail.people.modal.placeholders.lastName'), {
      target: { value: 'Petrovska' },
    });
    fireEvent.click(screen.getByText('detail.people.modal.submit'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Petrovska')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('detail.people.personAdded');
  });
});
