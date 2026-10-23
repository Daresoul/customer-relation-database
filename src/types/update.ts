/**
 * Update System Types
 * Feature: Auto-Update System
 */

/**
 * Update preferences stored in database (singleton)
 */
export interface UpdatePreferences {
  id: number;
  autoCheckEnabled: boolean;
  lastCheckTimestamp: number | null;
  lastNotifiedVersion: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What Tauri's `checkUpdate` reports; the release notes are in `body`. */
export type { UpdateManifest } from '@tauri-apps/api/updater';
import type { UpdateManifest } from '@tauri-apps/api/updater';

/**
 * Update status for UI state management
 */
export type UpdateStatus =
  | 'idle' // No update check in progress
  | 'checking' // Checking for updates
  | 'downloading' // Downloading update
  | 'ready' // Update downloaded and ready to install
  | 'installing' // Installing update and restarting
  | 'error'; // Error occurred during update process

/**
 * Update state managed by useUpdater hook
 */
export interface UpdateState {
  status: UpdateStatus;
  manifest: UpdateManifest | null;
  error: string | null;
}
