/**
 * Update Service
 * Feature: Auto-Update System
 * Wraps Tauri update commands and updater API
 */

import { invoke } from '@tauri-apps/api/tauri';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import type { UpdatePreferences } from '../types/update';

export const updateService = {
  /**
   * Get update preferences from database
   */
  async getPreferences(): Promise<UpdatePreferences> {
    const prefs = await invoke<{
      id: number;
      auto_check_enabled: boolean;
      last_check_timestamp: number | null;
      last_notified_version: string | null;
      created_at: number;
      updated_at: number;
    }>('get_update_preferences');

    // Convert snake_case to camelCase for TypeScript
    return {
      id: prefs.id,
      autoCheckEnabled: prefs.auto_check_enabled,
      lastCheckTimestamp: prefs.last_check_timestamp,
      lastNotifiedVersion: prefs.last_notified_version,
      createdAt: prefs.created_at,
      updatedAt: prefs.updated_at,
    };
  },

  /**
   * Enable or disable automatic update checking
   */
  async setAutoCheckEnabled(enabled: boolean): Promise<void> {
    return invoke('set_auto_check_enabled', { enabled });
  },

  /**
   * Record an update check with optional notified version
   */
  async recordCheck(notifiedVersion?: string): Promise<void> {
    return invoke('record_update_check', {
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
   * Install update and restart the application
   */
  async installAndRestart() {
    await installUpdate();
    await relaunch();
  },

  /**
   * Subscribe to updater events
   * Returns an unlisten function to cleanup the event listener
   */
  onUpdateEvent(handler: (event: any) => void) {
    return onUpdaterEvent(handler);
  },
};
