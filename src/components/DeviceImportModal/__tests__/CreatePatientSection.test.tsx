import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [{ id: 1, name: 'Dog' }], isLoading: false }),
}));
vi.mock('../../../hooks/useBreeds', () => ({
  useBreeds: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../forms/CreateHouseholdModal', () => ({
  CreateHouseholdModal: () => null,
}));

import CreatePatientSection from '../CreatePatientSection';
import type { ExtractedPatientData } from '../../../types/deviceImport';

function section(extractedData: ExtractedPatientData, prefillMicrochipId?: string) {
  return (
    <AntApp>
      <CreatePatientSection
        extractedData={extractedData}
        conflicts={[]}
        onPatientCreated={vi.fn()}
        onCancel={vi.fn()}
        isExpanded
        onToggleExpand={vi.fn()}
        prefillMicrochipId={prefillMicrochipId}
      />
    </AntApp>
  );
}

const fromDevice = (): ExtractedPatientData => ({ name: 'tesi', species: 'Dog', sources: ['pc.json'] });

describe('CreatePatientSection — prefill is applied once', () => {
  it('starts with the device values', () => {
    render(section(fromDevice()));
    expect(screen.getAllByPlaceholderText('forms:placeholders.enterName')[0]).toHaveValue('tesi');
  });

  it('keeps what the user typed when the parent re-renders after a chip scan', async () => {
    const user = userEvent.setup();
    const { rerender } = render(section(fromDevice()));
    const name = screen.getAllByPlaceholderText('forms:placeholders.enterName')[0];

    await user.clear(name);
    await user.type(name, 'Тесла');
    rerender(section(fromDevice(), '807010000007678'));

    expect(screen.getAllByPlaceholderText('forms:placeholders.enterName')[0]).toHaveValue('Тесла');
    expect(screen.getByTestId('create-patient-section-microchip-input')).toHaveValue('807010000007678');
  });

  it('keeps a blank form the user filled when the parent re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(section(fromDevice()));

    await user.click(screen.getByText('medical:deviceImport.startBlankToggle'));
    const name = screen.getAllByPlaceholderText('forms:placeholders.enterName')[0];
    expect(name).toHaveValue('');
    await user.type(name, 'Bella');
    rerender(section(fromDevice()));

    expect(screen.getAllByPlaceholderText('forms:placeholders.enterName')[0]).toHaveValue('Bella');
  });
});
