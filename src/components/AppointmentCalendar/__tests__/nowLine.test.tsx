import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { App } from 'antd';
import dayjs from 'dayjs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

import DayViewSimple from '../DayViewSimple';
import WeekView from '../WeekView';

const handlers = { onSelectAppointment: vi.fn(), onCreateAppointment: vi.fn() };

function renderDay(date = dayjs()) {
  return render(
    <App>
      <DayViewSimple selectedDate={date} appointments={[]} {...handlers} />
    </App>,
  );
}

function renderWeek() {
  return render(
    <App>
      <WeekView selectedDate={dayjs()} appointments={[]} {...handlers} />
    </App>,
  );
}

const lineTop = (container: HTMLElement) =>
  (container.querySelector('.current-time-line') as HTMLElement | null)?.style.top;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Now line and scroll to now', () => {
  it('day view moves the now line as time passes', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(dayjs().hour(10).minute(0).second(0).toDate());
    const { container } = renderDay();
    expect(lineTop(container)).toBe(`${60 + 40 * 20}px`);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(lineTop(container)).toBe(`${60 + 41 * 20}px`);
  });

  it('week view moves the now line as time passes', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(dayjs().hour(10).minute(0).second(0).toDate());
    const { container } = renderWeek();
    expect(lineTop(container)).toBe(`${60 + 40 * 20}px`);

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(lineTop(container)).toBe(`${60 + 42 * 20}px`);
  });

  it('day view opens scrolled to about an hour before now when showing today', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(dayjs().hour(14).minute(20).second(0).toDate());
    const { container } = renderDay();

    expect((container.querySelector('.current-time-line')!.parentElement as HTMLElement).scrollTop).toBe(13 * 80);
  });

  it('day view for another day stays at the top', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(dayjs().hour(14).minute(20).second(0).toDate());
    const { container } = renderDay(dayjs().add(2, 'day'));

    expect(container.querySelector('.current-time-line')).toBeNull();
    expect((container.querySelector('.day-content-column')!.closest('[class*="dayView"]') as HTMLElement).scrollTop).toBe(0);
  });
});
