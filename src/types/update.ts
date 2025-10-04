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

/**
 * Update manifest from Tauri updater
 */
export interface UpdateManifest {
  version: string;
  notes?: string;
  pub_date: string;
  platforms: Record<
    string,
    {
      signature: string;
      url: string;
    }
  >;
}

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
