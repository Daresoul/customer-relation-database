// T031: Google Calendar service layer
import { invoke } from '@tauri-apps/api';
import type {
  GoogleCalendarSettings,
  OAuthFlowState,
  SyncLog
} from '../types/googleCalendar';

class GoogleCalendarService {
  /**
   * Start OAuth flow - opens browser for user authorization
   */
  async startOAuthFlow(): Promise<OAuthFlowState> {
    return await invoke<OAuthFlowState>('start_oauth_flow');
  }

  /**
   * Complete OAuth flow after user authorization
   */
  async completeOAuthFlow(code: string, state: string): Promise<GoogleCalendarSettings> {
    return await invoke<GoogleCalendarSettings>('complete_oauth_flow', { code, state });
  }

  /**
   * Cancel ongoing OAuth flow
   */
  async cancelOAuthFlow(): Promise<void> {
    await invoke('cancel_oauth_flow');
  }

  /**
   * Check if OAuth callback was received (returns code and state if available)
   */
  async checkOAuthCallback(): Promise<[string, string] | null> {
    return await invoke<[string, string] | null>('check_oauth_callback');
  }

  /**
   * Get current Google Calendar settings
   */
  async getSettings(): Promise<GoogleCalendarSettings> {
    return await invoke<GoogleCalendarSettings>('get_google_calendar_settings');
  }

  /**
   * Enable or disable automatic sync
   */
  async updateSyncEnabled(enabled: boolean): Promise<GoogleCalendarSettings> {
    return await invoke<GoogleCalendarSettings>('update_sync_enabled', { enabled });
  }

  /**
   * Disconnect Google Calendar (clears tokens)
   */
  async disconnect(): Promise<void> {
    await invoke('disconnect_google_calendar');
  }

  /**
   * Revoke access and disconnect
   */
  async revokeAccess(): Promise<void> {
    await invoke('revoke_google_access');
  }

  /**
   * Trigger manual sync of appointments to Google Calendar
   */
  async triggerSync(): Promise<SyncLog> {
    return await invoke<SyncLog>('trigger_manual_sync');
  }

  /**
   * Get sync history
   */
  async getSyncHistory(limit: number = 10): Promise<SyncLog[]> {
    return await invoke<SyncLog[]>('get_sync_history', { limit });
  }

  /**
   * Check if sync is currently in progress
   */
  async checkSyncStatus(): Promise<SyncLog | null> {
    return await invoke<SyncLog | null>('check_sync_status');
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
