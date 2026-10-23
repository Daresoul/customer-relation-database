import type { BackupConfig } from '@/types/generated/BackupConfig';

export type BackupLevel = 'ok' | 'warn' | 'failed';
export type BackupReason = 'ok' | 'old' | 'never' | 'notConfigured' | 'failed' | 'unknown';

const MAX_AGE_HOURS = 26;

/** Red: the last attempt failed. Amber: no folder, never ran, or older than 26 h. Green otherwise. */
export function backupHealth(config: BackupConfig, now: Date): { level: BackupLevel; reason: BackupReason } {
  if (config.lastError) return { level: 'failed', reason: 'failed' };
  if (!config.directory) return { level: 'warn', reason: 'notConfigured' };
  if (!config.lastBackupAt) return { level: 'warn', reason: 'never' };
  const ageHours = (now.getTime() - new Date(config.lastBackupAt).getTime()) / 3_600_000;
  if (!(ageHours < MAX_AGE_HOURS)) return { level: 'warn', reason: 'old' };
  return { level: 'ok', reason: 'ok' };
}

export const BACKUP_CONFIG_KEY = ['backup', 'config'] as const;
