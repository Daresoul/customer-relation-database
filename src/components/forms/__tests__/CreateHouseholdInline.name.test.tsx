/**
 * flow-frontdesk #14: staff typed the owner's last name twice, once as the
 * household name. The household name follows the last name until it is
 * typed into.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../services/householdService', () => ({
  HouseholdService: { findDuplicates: vi.fn().mockResolvedValue([]), createHouseholdWithPeople: vi.fn(), updateHousehold: vi.fn() },
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));

import { CreateHouseholdInline } from '../CreateHouseholdInline';

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <CreateHouseholdInline onCreated={vi.fn()} onCancel={vi.fn()} />
      </App>
    </QueryClientProvider>,
  );
  const [household, , lastName] = screen.getAllByPlaceholderText('forms:placeholders.enterName') as HTMLInputElement[];
  return { household, lastName };
}

describe('CreateHouseholdInline household name', () => {
  afterEach(cleanup);

  it('follows the last name while untouched', () => {
    const { household, lastName } = renderForm();
    fireEvent.change(lastName, { target: { value: 'Петровски' } });
    expect(household.value).toBe('Петровски');
    fireEvent.change(lastName, { target: { value: 'Петровска' } });
    expect(household.value).toBe('Петровска');
  });

  it('keeps a household name the user typed', () => {
    const { household, lastName } = renderForm();
    fireEvent.change(household, { target: { value: 'Фарма Петровски' } });
    fireEvent.change(lastName, { target: { value: 'Петровски' } });
    expect(household.value).toBe('Фарма Петровски');
  });
});
