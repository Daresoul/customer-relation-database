import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const searchHouseholds = vi.fn();
const getMergePreview = vi.fn();
const mergeHouseholds = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: {
    searchHouseholds: (...a: unknown[]) => searchHouseholds(...a),
    getMergePreview: (...a: unknown[]) => getMergePreview(...a),
    mergeHouseholds: (...a: unknown[]) => mergeHouseholds(...a),
  },
}));

import { MergeHouseholdModal } from '../MergeHouseholdModal';

const result = (id: number, name: string) => ({
  id,
  householdName: name,
  address: 'Партизанска 1',
  petCount: 1,
  relevanceScore: 0,
  people: [{ id: id * 10, firstName: 'Ана', lastName: name, isPrimary: true, contacts: [{ id: 1, contactType: 'phone', contactValue: '070 111 222' }] }],
});

const side = (id: number, name: string, pets: string[], records: number) => ({
  household: { id, householdName: name, address: `${name} 1`, city: 'Скопје' },
  people: [{ id: id * 10, firstName: 'Ана', lastName: name, isPrimary: true, contacts: [{ id: 1, contactType: 'phone', contactValue: '070 111 222' }] }],
  pets: pets.map((p, i) => ({ id: id * 100 + i, name: p })),
  recordCount: records,
  appointmentCount: 1,
});

function renderModal() {
  const onMerged = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <MergeHouseholdModal open householdId={4} onClose={vi.fn()} onMerged={onMerged} />
      </App>
    </QueryClientProvider>,
  );
  return { onMerged };
}

async function pickHousehold(text: string) {
  const search = screen.getByRole('combobox');
  fireEvent.mouseDown(search);
  fireEvent.change(search, { target: { value: 'Петро' } });
  const option = await waitFor(() => {
    const items = Array.from(document.querySelectorAll('.ant-select-item-option')) as HTMLElement[];
    const item = items.find((i) => i.textContent?.includes(text));
    expect(item).toBeDefined();
    return item!;
  }, { timeout: 2000 });
  fireEvent.click(option);
}

describe('MergeHouseholdModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('never offers this household as the one to merge in', async () => {
    searchHouseholds.mockResolvedValue({ results: [result(4, 'Петровски'), result(9, 'Петровски 2')], total: 2, hasMore: false });
    renderModal();

    const search = screen.getByRole('combobox');
    fireEvent.mouseDown(search);
    fireEvent.change(search, { target: { value: 'Петро' } });

    const offered = await waitFor(() => {
      const texts = Array.from(document.querySelectorAll('.ant-select-item-option')).map((i) => i.textContent ?? '');
      expect(texts.some((t) => t.includes('Петровски 2'))).toBe(true);
      return texts;
    }, { timeout: 2000 });
    expect(offered).toHaveLength(1);
  });

  it('previews both households, then merges the chosen one into this one', async () => {
    searchHouseholds.mockResolvedValue({ results: [result(9, 'Петровски 2')], total: 1, hasMore: false });
    getMergePreview.mockResolvedValue({ keep: side(4, 'Петровски', ['Рекс'], 0), merge: side(9, 'Петровски 2', ['Луна'], 3) });
    mergeHouseholds.mockResolvedValue(undefined);
    const { onMerged } = renderModal();

    await pickHousehold('Петровски 2');

    expect(await screen.findByText('Луна')).toBeInTheDocument();
    expect(getMergePreview).toHaveBeenCalledWith(4, 9);
    expect(screen.getByText('Рекс')).toBeInTheDocument();
    expect(document.body.textContent).toContain('070 111 222');

    fireEvent.click(screen.getByText('detail.merge.confirm'));

    await waitFor(() => expect(mergeHouseholds).toHaveBeenCalledWith(4, 9, 4));
    await waitFor(() => expect(onMerged).toHaveBeenCalled());
  });

  it('can keep the other household\'s name and address', async () => {
    searchHouseholds.mockResolvedValue({ results: [result(9, 'Петровски 2')], total: 1, hasMore: false });
    getMergePreview.mockResolvedValue({ keep: side(4, 'Петровски', [], 0), merge: side(9, 'Петровски 2', [], 0) });
    mergeHouseholds.mockResolvedValue(undefined);
    renderModal();

    await pickHousehold('Петровски 2');
    fireEvent.click(await screen.findByText('detail.merge.otherHousehold'));
    fireEvent.click(screen.getByText('detail.merge.confirm'));

    await waitFor(() => expect(mergeHouseholds).toHaveBeenCalledWith(4, 9, 9));
  });

  it('keeps the dialog open and says so when the merge fails', async () => {
    searchHouseholds.mockResolvedValue({ results: [result(9, 'Петровски 2')], total: 1, hasMore: false });
    getMergePreview.mockResolvedValue({ keep: side(4, 'Петровски', [], 0), merge: side(9, 'Петровски 2', [], 0) });
    mergeHouseholds.mockRejectedValue(new Error('database is locked'));
    const { onMerged } = renderModal();

    await pickHousehold('Петровски 2');
    fireEvent.click(await screen.findByText('detail.merge.confirm'));

    expect(await screen.findByText('detail.merge.failed')).toBeInTheDocument();
    expect(onMerged).not.toHaveBeenCalled();
    expect(screen.getByText('detail.merge.confirm')).toBeInTheDocument();
  });
});
