/**
 * Update Service
 * Feature: Auto-Update System
 * Wraps Tauri update commands and updater API
 */

import { ApiService } from './api';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import type { UpdatePreferences } from '../types/update';

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
    return ApiService.invoke('record_update_check', {
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
