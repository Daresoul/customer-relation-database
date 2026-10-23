const MINUTE = 60 * 1000;

export const FIRST_CHECK_DELAY = 10 * 1000;
export const RETRY_DELAYS = [5 * MINUTE, 15 * MINUTE, 60 * MINUTE];
export const DAILY = 24 * 60 * MINUTE;

/**
 * Runs `check` 10 s from now, then once a day. A check that resolves false
 * or throws is retried after 5, 15 and 60 minutes; after that the next try
 * is the daily one. Returns a function that stops all further checks.
 */
export function scheduleUpdateChecks(check: () => Promise<boolean>): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let failures = 0;

  const run = async () => {
    let ok = false;
    try {
      ok = await check();
    } catch {
      ok = false;
    }
    if (stopped) return;
    if (ok) {
      failures = 0;
      timer = setTimeout(run, DAILY);
    } else if (failures < RETRY_DELAYS.length) {
      timer = setTimeout(run, RETRY_DELAYS[failures]);
      failures += 1;
    } else {
      failures = 0;
      timer = setTimeout(run, DAILY);
    }
  };

  timer = setTimeout(run, FIRST_CHECK_DELAY);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
