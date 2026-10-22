import type { DeviceConnectionStatus, FileWatcherStatus } from '../../types/deviceIntegration';

type T = (key: string, options?: Record<string, unknown>) => string;

export interface HealthText {
  text: string;
  action?: string;
  details?: string;
}

export function formatLastResult(_iso: string | undefined | null, _now: Date, _t: T): string | null {
  throw new Error('not implemented');
}

export function describeSerialStatus(_status: DeviceConnectionStatus | undefined, _t: T): HealthText {
  throw new Error('not implemented');
}

export function describeFolderStatus(_status: FileWatcherStatus | undefined, _t: T): HealthText {
  throw new Error('not implemented');
}
