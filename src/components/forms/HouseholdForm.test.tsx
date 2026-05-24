/**
 * Smoke tests for HouseholdForm — specifically the v0.5.15 patient-
 * association feature.
 *
 * Before v0.5.15 the household form had no concept of patients —
 * association was patient → household only. The new edit-mode section
 * lists patients in the household, lets the user search for existing
 * ones to add, and removes them via Popconfirm. Create mode hides the
 * list and shows a "save first" hint instead (we can't assign
 * patients to a household that doesn't have an id yet).
 *
 * These tests guard those visibility rules — the failure mode if the
 * mode-gate regresses would be either:
 *   - patients section appearing in create mode (broken assignment
 *     because householdId is undefined), or
 *   - patients section missing in edit mode (the bug we just fixed).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// Mock the invoke service BEFORE the component imports it. Patient list
// fetch happens in a useEffect on mount; we return an empty array so the
// "no patients yet" empty state is exercised without any further setup.
vi.mock('@/services/invoke', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'get_patients') return [];
    if (cmd === 'search_patients') return [];
    return null;
  }),
}));

import { HouseholdForm } from './HouseholdForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HouseholdForm — patient association (edit mode)', () => {
  it('renders the Patients section when mode=edit and initialValues.id is set', async () => {
    render(
      <HouseholdForm
        mode="edit"
        initialValues={{
          id: 42,
          lastName: 'Smith',
          contacts: [],
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The Divider has an orientation="left" with text "Patients".
    // Multiple text matches are fine; we just need at least one
    // present that's NOT the form-level patients hint.
    await waitFor(() => {
      expect(screen.getAllByText(/Patients/i).length).toBeGreaterThan(0);
    });

    // The "Add existing patient" search field must be present.
    expect(
      screen.getByText(/Add existing patient/i),
    ).toBeInTheDocument();

    // The empty-state for no current patients should appear (we mocked
    // get_patients to return []).
    await waitFor(() => {
      expect(
        screen.getByText(/No patients in this household yet/i),
      ).toBeInTheDocument();
    });

    // The create-mode hint must NOT show in edit mode.
    expect(
      screen.queryByText(/Save this household first/i),
    ).not.toBeInTheDocument();
  });
});

describe('HouseholdForm — patient association (create mode)', () => {
  it('hides the patient list and shows the "save first" hint when mode=create', () => {
    render(
      <HouseholdForm
        mode="create"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The create-mode hint explaining the limitation.
    expect(
      screen.getByText(/Save this household first/i),
    ).toBeInTheDocument();

    // The "Add existing patient" search must NOT show.
    expect(
      screen.queryByText(/Add existing patient/i),
    ).not.toBeInTheDocument();

    // The empty-state list shouldn't appear either — there's no
    // householdId to associate against, so no fetch and no list at all.
    expect(
      screen.queryByText(/No patients in this household yet/i),
    ).not.toBeInTheDocument();
  });

  it('hides the patient list when mode=edit but initialValues has no id', () => {
    // Edge case: mode is edit but the consumer didn't pass an id (e.g.
    // a stale state somewhere). The component must not try to fetch
    // patients for an undefined household — it falls back to the
    // create-mode hint behavior.
    render(
      <HouseholdForm
        mode="edit"
        initialValues={{
          lastName: 'NoId Household',
          contacts: [],
        } as any}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // No Patients section content should render.
    expect(
      screen.queryByText(/Add existing patient/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No patients in this household yet/i),
    ).not.toBeInTheDocument();
  });
});
