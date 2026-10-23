import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const createSpecies = vi.fn(async () => ({ id: 42, name: 'Ferret' }));
const createBreed = vi.fn(async () => ({ id: 77, name: 'Angora', speciesId: 42 }));
vi.mock('../../hooks/useBreeds', () => ({
  useCreateBreed: () => ({ mutateAsync: createBreed, isPending: false }),
}));
vi.mock('../../hooks/useSpecies', () => ({
  useCreateSpecies: () => ({ mutateAsync: createSpecies, isPending: false }),
  useSpecies: () => ({ data: [{ id: 42, name: 'Ferret' }], isLoading: false }),
}));

import { CreateSpeciesModal } from './CreateSpeciesModal';
import { CreateBreedModal } from '../CreateBreedModal/CreateBreedModal';

// patient.md #7: the page looked the new name up in the list it had before
// the create, found nothing, and left the patient's species unchanged.
describe('create species / breed from a patient', () => {
  afterEach(() => cleanup());

  it('hands back the created species with its id', async () => {
    const onSuccess = vi.fn();
    render(<App><CreateSpeciesModal open initialName="ferret" onClose={vi.fn()} onSuccess={onSuccess} /></App>);

    fireEvent.click(await screen.findByRole('button', { name: 'common:create' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][1]).toMatchObject({ id: 42 });
  });

  it('hands back the created breed with its id', async () => {
    const onSuccess = vi.fn();
    render(<App><CreateBreedModal open initialName="angora" speciesId={42} onClose={vi.fn()} onSuccess={onSuccess} /></App>);

    fireEvent.click(await screen.findByRole('button', { name: 'common:create' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][1]).toMatchObject({ id: 77 });
  });
});
