import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const findDuplicates = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: { findDuplicates: (...args: unknown[]) => findDuplicates(...args) },
}));

import { DuplicateHouseholdWarning } from '../DuplicateHouseholdWarning';

const match = {
  householdId: 7,
  householdName: 'Петровски',
  primaryPerson: 'Марко Петровски',
  phone: '070 123 456',
  address: 'Партизанска 1',
  city: 'Скопје',
  petCount: 2,
  reasons: ['phone', 'name'],
};

function renderWarning(props: Partial<React.ComponentProps<typeof DuplicateHouseholdWarning>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={<DuplicateHouseholdWarning check={{ phones: ['070123456'] }} debounceMs={0} {...props} />}
        />
        <Route path="/households/:id" element={<div>household page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DuplicateHouseholdWarning', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists a possible existing client with who, phone, address and why', async () => {
    findDuplicates.mockResolvedValue([match]);
    renderWarning();

    expect(await screen.findByText('duplicates.title')).toBeInTheDocument();
    expect(findDuplicates).toHaveBeenCalledWith({ phones: ['070123456'] });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Петровски');
    expect(text).toContain('Марко Петровски');
    expect(text).toContain('070 123 456');
    expect(text).toContain('Партизанска 1');
    expect(text).toContain('duplicates.reasons.phone');
    expect(text).toContain('duplicates.reasons.name');
  });

  it('Open goes to the existing household', async () => {
    findDuplicates.mockResolvedValue([match]);
    renderWarning();

    fireEvent.click(await screen.findByText('duplicates.open'));
    expect(await screen.findByText('household page')).toBeInTheDocument();
  });

  it('Use this household hands the match to the form', async () => {
    findDuplicates.mockResolvedValue([match]);
    const onUseExisting = vi.fn();
    renderWarning({ onUseExisting });

    fireEvent.click(await screen.findByText('duplicates.useThis'));
    expect(onUseExisting).toHaveBeenCalledWith(match);
  });

  it('offers no Use button when the form has no use for it', async () => {
    findDuplicates.mockResolvedValue([match]);
    renderWarning();

    await screen.findByText('duplicates.title');
    expect(screen.queryByText('duplicates.useThis')).not.toBeInTheDocument();
  });

  it('reports how many matches it shows', async () => {
    findDuplicates.mockResolvedValue([match]);
    const onMatchesChange = vi.fn();
    renderWarning({ onMatchesChange });

    await waitFor(() => expect(onMatchesChange).toHaveBeenLastCalledWith(1));
  });

  it('shows nothing, and never blocks, when the check fails', async () => {
    findDuplicates.mockRejectedValue(new Error('database is locked'));
    const onMatchesChange = vi.fn();
    renderWarning({ onMatchesChange });

    await waitFor(() => expect(findDuplicates).toHaveBeenCalled());
    await waitFor(() => expect(onMatchesChange).toHaveBeenLastCalledWith(0));
    expect(screen.queryByText('duplicates.title')).not.toBeInTheDocument();
  });

  it('does not ask while nothing useful is typed', async () => {
    renderWarning({ check: { householdName: ' ', phones: [''], emails: [] } });

    await new Promise((r) => setTimeout(r, 20));
    expect(findDuplicates).not.toHaveBeenCalled();
  });
});
