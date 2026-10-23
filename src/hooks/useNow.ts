import { useEffect, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';

/** The current time, refreshed every `intervalMs` (a minute by default). */
export function useNow(intervalMs = 60_000): Dayjs {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
