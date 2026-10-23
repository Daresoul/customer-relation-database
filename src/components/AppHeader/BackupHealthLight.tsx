import type { BackupConfig } from '@/types/generated/BackupConfig';

export type BackupLevel = 'ok' | 'warn' | 'failed';

export function backupHealth(_config: BackupConfig, _now: Date): { level: BackupLevel; reason: string } {
  return { level: 'ok', reason: 'ok' };
}

export function BackupHealthLight() {
  return null;
}
