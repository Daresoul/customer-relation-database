/**
 * settings.md #14, lifecycle #8: the app checked for updates once, 10 s after
 * start, and never again. A failed check retries, and a clinic PC left on
 * for weeks checks every day.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleUpdateChecks } from '../updateCheckSchedule';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

describe('scheduleUpdateChecks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks 10 s after start, then every day', async () => {
    const check = vi.fn().mockResolvedValue(true);
    const stop = scheduleUpdateChecks(check);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(check).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DAY);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it('retries a failed check after 5, 15 and 60 minutes, then waits a day', async () => {
    const check = vi.fn().mockResolvedValue(false);
    const stop = scheduleUpdateChecks(check);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(check).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(check).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(DAY - 1);
    expect(check).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(5);
    stop();
  });

  it('a check that throws counts as failed', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const stop = scheduleUpdateChecks(check);

    await vi.advanceTimersByTimeAsync(10_000 + 5 * MIN);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops checking once stopped', async () => {
    const check = vi.fn().mockResolvedValue(true);
    const stop = scheduleUpdateChecks(check);
    stop();

    await vi.advanceTimersByTimeAsync(2 * DAY);
    expect(check).not.toHaveBeenCalled();
  });
});
