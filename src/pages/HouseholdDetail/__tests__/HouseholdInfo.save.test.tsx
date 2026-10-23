/**
 * household #15: every inline field save popped a "Saved" toast; only a
 * failure needs saying.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mutateAsync = vi.fn();
vi.mock('../../../hooks/useHousehold', () => ({
  useUpdateHousehold: () => ({ mutateAsync, isPending: false }),
}));
const saves = vi.hoisted(() => [] as Array<(v: string) => Promise<void>>);
vi.mock('../../../hooks/useAutoSave', () => ({
  useInlineEdit: ({ onSave }: { onSave: (v: string) => Promise<void> }) => {
    saves.push(onSave);
    return { value: '', onChange: vi.fn(() => ({ success: true })) };
  },
}));

import { HouseholdInfo } from '../HouseholdInfo';

function renderInfo() {
  saves.length = 0;
  render(
    <App>
      <HouseholdInfo household={{ id: 4, householdName: 'Петровски' } as never} />
    </App>,
  );
}

describe('HouseholdInfo inline saves', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('saves quietly', async () => {
    mutateAsync.mockResolvedValue(undefined);
    renderInfo();

    await act(() => saves[0]('Петровски-Николовски'));

    expect(mutateAsync).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).not.toContain('detail.householdInfo.saved');
  });

  it('says when a save failed', async () => {
    mutateAsync.mockRejectedValue(new Error('database is locked'));
    renderInfo();

    await act(() => saves[0]('Петровски-Николовски'));

    await waitFor(() => expect(document.body.textContent).toContain('detail.householdInfo.failedToSave'));
  });
});
