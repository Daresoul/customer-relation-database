/**
 * forms #9: the species form required a colour that was saved nowhere.
 * forms #8: a name made of spaces passed the required rule.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const createSpecies = vi.fn().mockResolvedValue({ id: 20, name: 'Ferret' });
vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  useCreateSpecies: () => ({ mutateAsync: createSpecies, isPending: false }),
  useUpdateSpecies: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSpecies: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useBreeds', () => ({
  useBreeds: () => ({ data: [], refetch: vi.fn() }),
  useCreateBreed: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBreed: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBreed: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import SpeciesSettings from '../components/SpeciesSettings';

function openAddSpecies() {
  render(
    <App>
      <SpeciesSettings isUpdating={false} />
    </App>,
  );
  fireEvent.click(screen.getByText('settings:species.addButton'));
}

describe('species form', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('asks for no colour and saves none', async () => {
    openAddSpecies();
    expect(screen.queryByText('settings:species.color')).not.toBeInTheDocument();

    fireEvent.change(await screen.findByPlaceholderText('settings:species.speciesPlaceholder'), { target: { value: 'ferret' } });
    fireEvent.click(screen.getByRole('button', { name: /ok/i }));

    await waitFor(() => expect(createSpecies).toHaveBeenCalled());
    expect(createSpecies.mock.calls[0][0]).not.toHaveProperty('color');
  });

  it('refuses a name made of spaces', async () => {
    openAddSpecies();

    fireEvent.change(await screen.findByPlaceholderText('settings:species.speciesPlaceholder'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /ok/i }));

    expect(await screen.findByText('forms:validation.required')).toBeInTheDocument();
    expect(createSpecies).not.toHaveBeenCalled();
  });
});
