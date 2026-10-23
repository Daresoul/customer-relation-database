import dayjs from 'dayjs';
import type { DeviceConnectionStatus, FileWatcherStatus } from '../../types/deviceIntegration';

type T = (key: string, options?: Record<string, unknown>) => string;

export interface HealthText {
  text: string;
  action?: string;
  details?: string;
}

/** "Last result 10:42", or with the date when it wasn't today. */
export function formatLastResult(iso: string | undefined | null, now: Date, t: T): string | null {
  if (!iso) return null;
  const at = dayjs(iso);
  if (!at.isValid()) return null;
  const time = at.format('HH:mm');
  if (at.isSame(dayjs(now), 'day')) {
    return t('health.lastResult', { time });
  }
  return t('health.lastResultOn', { date: at.format('DD.MM.'), time });
}

function problem(kind: string, params: Record<string, unknown>, details: string | undefined, t: T): HealthText {
  return {
    text: t(`health.kinds.${kind}.title`, params),
    action: t(`health.kinds.${kind}.action`, params),
    details,
  };
}

export function describeSerialStatus(status: DeviceConnectionStatus | undefined, t: T): HealthText {
  if (!status) return { text: t('status.unknown') };
  const params = { port: status.port_name };
  switch (status.status) {
    case 'Connected':
      return { text: t('status.connected') };
    case 'Connecting':
      return { text: t('status.connecting') };
    case 'Disconnected':
    case 'Error':
      return problem(status.error_kind ?? 'unknown', params, status.last_error, t);
    default:
      return { text: t('status.unknown') };
  }
}

/** working ✓ · waiting ○ (starting, stopped, no status yet) · down ✕ */
export type HealthLevel = 'working' | 'waiting' | 'down';

const LEVEL_RANK: Record<HealthLevel, number> = { working: 0, waiting: 1, down: 2 };

/** Same grace as the backend tray (services/device_health.rs): a port counts as down after a minute. */
export const SERIAL_DOWN_GRACE_MS = 60_000;

function isSerialDown(status: DeviceConnectionStatus): boolean {
  if (status.status === 'Connected') return false;
  return !(status.status === 'Connecting' && !status.retry_count && !status.error_kind);
}

/**
 * `downSince` is when the port stopped working (see `serialDownSince`); within
 * a minute of it the port waits instead of showing down, so one failed retry
 * doesn't flash red. Without it a failing port is down.
 */
export function serialLevel(
  status: DeviceConnectionStatus | undefined,
  downSince?: number,
  now: number = Date.now(),
): HealthLevel {
  if (!status) return 'waiting';
  if (status.status === 'Connected') return 'working';
  if (!isSerialDown(status)) return 'waiting';
  if (downSince !== undefined && now - downSince < SERIAL_DOWN_GRACE_MS) return 'waiting';
  return 'down';
}

const serialDownStart = new Map<number, number>();

/** When this port stopped working, remembered across renders until it works again. */
export function serialDownSince(status: DeviceConnectionStatus | undefined, now: number = Date.now()): number | undefined {
  if (!status) return undefined;
  if (!isSerialDown(status)) {
    serialDownStart.delete(status.integration_id);
    return undefined;
  }
  const since = serialDownStart.get(status.integration_id) ?? now;
  serialDownStart.set(status.integration_id, since);
  return since;
}

export function folderLevel(status: FileWatcherStatus | undefined): HealthLevel {
  if (!status) return 'waiting';
  if (status.status === 'Watching') return 'working';
  if (status.status === 'Error') return 'down';
  return 'waiting';
}

/** The worst level wins; `count` is how many machines are at it (0 when all work). */
export function rollupHealth(levels: HealthLevel[]): { level: HealthLevel | 'none'; count: number } {
  if (levels.length === 0) return { level: 'none', count: 0 };
  const worst = levels.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a));
  return { level: worst, count: worst === 'working' ? 0 : levels.filter((l) => l === worst).length };
}

export function describeFolderStatus(status: FileWatcherStatus | undefined, t: T): HealthText {
  if (!status) return { text: t('status.unknown') };
  switch (status.status) {
    case 'Watching':
      return { text: t('status.watching') };
    case 'Stopped':
      return { text: t('status.stopped') };
    case 'Error':
      return problem(status.error_kind ?? 'unknown', { directory: status.watch_directory }, status.last_error, t);
    default:
      return { text: t('status.unknown') };
  }
}
