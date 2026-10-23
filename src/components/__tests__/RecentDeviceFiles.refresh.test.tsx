import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { App } from 'antd';
import { useState } from 'react';

const mocks = vi.hoisted(() => ({ getRecentDeviceFiles: vi.fn() }));

vi.mock('../../services/fileHistoryService', () => ({
  fileHistoryService: { getRecentDeviceFiles: mocks.getRecentDeviceFiles, openDeviceFile: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe('RecentDeviceFiles — refresh handed to the parent', () => {
  it('the refresh the parent keeps loads the current number of days', async () => {
    mocks.getRecentDeviceFiles.mockReset().mockResolvedValue([]);
    const { default: RecentDeviceFiles } = await import('../RecentDeviceFiles');
    let refresh: (() => void) | null = null;
    let showDays: (days: number) => void = () => {};
    // A stable callback, as a parent written with useCallback passes.
    const keepRefresh = (fn: () => void) => {
      refresh = fn;
    };
    function Parent() {
      const [days, setDays] = useState(14);
      showDays = setDays;
      return <RecentDeviceFiles days={days} onRefreshNeeded={keepRefresh} />;
    }
    render(
      <App>
        <Parent />
      </App>,
    );
    await act(async () => {});

    await act(async () => showDays(30));
    mocks.getRecentDeviceFiles.mockClear();
    await act(async () => refresh?.());

    expect(mocks.getRecentDeviceFiles).toHaveBeenCalledWith(30);
  });

  it('handing the refresh to the parent does not re-render without end', async () => {
    mocks.getRecentDeviceFiles.mockReset().mockResolvedValue([]);
    const { default: RecentDeviceFiles } = await import('../RecentDeviceFiles');
    let renders = 0;
    function Parent() {
      renders += 1;
      const [, setRefresh] = useState<(() => void) | null>(null);
      // Stops a runaway loop so the test can fail instead of hang.
      const keep = (fn: () => void) => {
        if (renders < 25) setRefresh(() => fn);
      };
      return <RecentDeviceFiles days={14} onRefreshNeeded={keep} />;
    }
    render(
      <App>
        <Parent />
      </App>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(renders).toBeLessThan(10);
  });
});
