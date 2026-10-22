/**
 * Update Service
 * Feature: Auto-Update System
 * Wraps Tauri update commands and updater API
 */

import { ApiService } from './api';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { invoke } from '@/services/invoke';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import type { UpdatePreferences } from '../types/update';
import type { BackupConfig } from '../types/generated/BackupConfig';
import type { TFunction } from '../utils/errors';

/** Asked when the pre-update backup failed; resolves true to update anyway. */
export type ConfirmUpdateWithoutBackup = (reason: string) => Promise<boolean>;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const updateService = {
  /**
   * Get update preferences from database
   * ApiService automatically transforms snake_case response to camelCase
   */
  async getPreferences(): Promise<UpdatePreferences> {
    return ApiService.invoke<UpdatePreferences>('get_update_preferences');
  },

  /**
   * Enable or disable automatic update checking
   */
  async setAutoCheckEnabled(enabled: boolean): Promise<void> {
    return ApiService.invoke('set_auto_check_enabled', { enabled });
  },

  /**
   * Record an update check with optional notified version
   */
  async recordCheck(notifiedVersion?: string): Promise<void> {
    return ApiService.invokeRaw('record_update_check', {
      notifiedVersion: notifiedVersion || null,
    });
  },

  /**
   * Check for available updates using Tauri updater
   */
  async checkForUpdates() {
    return checkUpdate();
  },

  /**
   * Install update and restart the application.
   *
   * Runs a pre-update backup first when a backup folder is set. If that
   * backup fails, the user is asked before installing; returns false when
   * they cancel. With no backup folder there is nothing to back up, so the
   * update goes ahead.
   */
  async installAndRestart(confirmWithoutBackup: ConfirmUpdateWithoutBackup): Promise<boolean> {
    let backupError: string | null = null;
    try {
      const config = await invoke<BackupConfig>('get_backup_config');
      if (config.directory) {
        await invoke('run_backup_now', { preUpdate: true });
      }
    } catch (err) {
      backupError = errorText(err);
    }
    if (backupError !== null && !(await confirmWithoutBackup(backupError))) {
      return false;
    }
    await installUpdate();
    await relaunch();
    return true;
  },

  /**
   * Subscribe to updater events
   * Returns an unlisten function to cleanup the event listener
   */
  onUpdateEvent(handler: (event: any) => void) {
    return onUpdaterEvent(handler);
  },
};

/**
 * Builds the "backup failed, update anyway?" question on top of an antd
 * modal API (from `App.useApp()`). Cancel has focus, so Enter keeps the
 * current version.
 */
export function createBackupFailedConfirm(
  modal: Pick<ModalHookAPI, 'confirm'>,
  t: TFunction,
): ConfirmUpdateWithoutBackup {
  return (reason) =>
    new Promise<boolean>((resolve) => {
      modal.confirm({
        title: t('updates.backupFailed.title'),
        content: t('updates.backupFailed.content', { reason }),
        okText: t('updates.backupFailed.updateAnyway'),
        cancelText: t('updates.backupFailed.cancel'),
        okButtonProps: { danger: true },
        autoFocusButton: 'cancel',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
}
