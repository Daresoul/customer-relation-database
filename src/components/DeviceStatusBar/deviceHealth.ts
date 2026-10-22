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
      return {
        text: status.retry_count ? t('status.connectingAttempt', { count: status.retry_count + 1 }) : t('status.connecting'),
      };
    case 'Disconnected':
    case 'Error':
      return problem(status.error_kind ?? 'unknown', params, status.last_error, t);
    default:
      return { text: t('status.unknown') };
  }
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
