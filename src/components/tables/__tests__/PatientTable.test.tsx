/**
 * Component tests for PatientTable, focused on the recently-added behaviors:
 *
 *   1. Name fallback — when patient.name is null/undefined, the row shows
 *      "No name" and stays clickable.
 *   2. Controlled vs uncontrolled search text — both modes work.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock the Tauri-invoke layer hooks so the species fetch resolves immediately
// with stub data instead of calling out.
vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [{ id: 1, name: 'Dog', color: '#3498db' }], isLoading: false }),
}));

import { PatientTable } from '../PatientTable';
import type { PatientWithHousehold } from '../../../types';

function makePatient(overrides: Partial<PatientWithHousehold> = {}): PatientWithHousehold {
  return {
    id: 1,
    name: 'Rex',
    species: 'Dog',
    breed: undefined,
    dateOfBirth: undefined,
    color: undefined,
    gender: undefined,
    weight: undefined,
    microchipId: undefined,
    notes: undefined,
    isActive: true,
    householdId: undefined,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  } as PatientWithHousehold;
}

function renderTable(patients: PatientWithHousehold[], extra: Partial<React.ComponentProps<typeof PatientTable>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PatientTable patients={patients} {...extra} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PatientTable — name column fallback', () => {
  it('renders the actual name when present', () => {
    renderTable([makePatient({ name: 'Buddy' })]);
    expect(screen.getByRole('button', { name: 'Buddy' })).toBeInTheDocument();
  });

  it('renders the "No name" fallback when name is missing', () => {
    renderTable([makePatient({ name: undefined })]);
    // The fallback uses i18n key 'entities:patient.noName' with default 'No name'.
    // Without an i18n provider configured, the default is returned.
    const button = screen.getByRole('button', { name: /No name|entities:patient\.noName/ });
    expect(button).toBeInTheDocument();
  });

  it('still has a clickable name button when name is missing', () => {
    renderTable([makePatient({ name: undefined, microchipId: '807010000007678' })]);
    const button = screen.getByRole('button', { name: /No name|entities:patient\.noName/ });
    // Button is clickable (in the DOM) — not disabled, not hidden.
    expect(button).not.toBeDisabled();
  });

  it('renders microchip in its own column even when name is missing', () => {
    renderTable([makePatient({ name: undefined, microchipId: '807010000007678' })]);
    expect(screen.getByText('807010000007678')).toBeInTheDocument();
  });
});

describe('PatientTable — controlled search text', () => {
  it('uses externally controlled value when searchText prop provided', () => {
    renderTable([makePatient({ name: 'Anything' })], { searchText: 'externally controlled' });
    const search = screen.getByDisplayValue('externally controlled');
    expect(search).toBeInTheDocument();
  });

  it('reports user input via onSearchTextChange when controlled', async () => {
    const onChange = vi.fn();
    renderTable([makePatient()], { searchText: '', onSearchTextChange: onChange });
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText(/patients:searchPlaceholder|search/i);
    await user.type(search, 'A');
    expect(onChange).toHaveBeenCalled();
    // Last call gets the cumulative typed value
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toBe('A');
  });

  it('uses internal state when no searchText prop provided (backward compat)', async () => {
    renderTable([makePatient({ name: 'Findable' })]);
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText(/patients:searchPlaceholder|search/i);
    await user.type(search, 'Find');
    // The input shows what was typed (internal state)
    expect((search as HTMLInputElement).value).toBe('Find');
  });
});
