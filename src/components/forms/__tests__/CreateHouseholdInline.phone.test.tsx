/**
 * A phone the form can't save is shown on the phone field, in the app
 * language — not as "an unexpected error" after pressing Create.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const create = vi.hoisted(() => vi.fn());
vi.mock('../../../services/householdService', () => ({
  HouseholdService: { findDuplicates: vi.fn().mockResolvedValue([]), createHouseholdWithPeople: create, updateHousehold: vi.fn() },
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));

import { CreateHouseholdInline } from '../CreateHouseholdInline';

afterEach(() => {
  cleanup();
  create.mockReset();
});

function fill(phone: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <CreateHouseholdInline onCreated={vi.fn()} onCancel={vi.fn()} />
      </App>
    </QueryClientProvider>,
  );
  const [household, first, last] = screen.getAllByPlaceholderText('forms:placeholders.enterName') as HTMLInputElement[];
  fireEvent.change(household, { target: { value: 'Петровски' } });
  fireEvent.change(first, { target: { value: 'Петар' } });
  fireEvent.change(last, { target: { value: 'Петровски' } });
  fireEvent.change(screen.getByPlaceholderText('forms:placeholders.enterPhone'), { target: { value: phone } });
  fireEvent.click(screen.getByRole('button', { name: /create/ }));
}

describe('CreateHouseholdInline phone', () => {
  it('says on the field when a phone is not a phone number', async () => {
    fill('12');
    expect(await screen.findByText('forms:validation.phone')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
