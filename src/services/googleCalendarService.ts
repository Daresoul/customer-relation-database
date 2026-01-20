// T031: Google Calendar service layer
import { ApiService } from './api';
import type {
  GoogleCalendarSettings,
  OAuthFlowState,
  SyncLog
} from '../types/googleCalendar';

export class GoogleCalendarService {
  /**
   * Start OAuth flow - opens browser for user authorization
   */
  static async startOAuthFlow(): Promise<OAuthFlowState> {
    return ApiService.invoke<OAuthFlowState>('start_oauth_flow');
  }

  /**
   * Complete OAuth flow after user authorization
   */
  static async completeOAuthFlow(code: string, state: string): Promise<GoogleCalendarSettings> {
    return ApiService.invoke<GoogleCalendarSettings>('complete_oauth_flow', { code, state });
  }

  /**
   * Cancel ongoing OAuth flow
   */
  static async cancelOAuthFlow(): Promise<void> {
    return ApiService.invoke('cancel_oauth_flow');
  }

  /**
   * Check if OAuth callback was received (returns code and state if available)
   */
  static async checkOAuthCallback(): Promise<[string, string] | null> {
    return ApiService.invoke<[string, string] | null>('check_oauth_callback');
  }

  /**
   * Get current Google Calendar settings
   */
  static async getSettings(): Promise<GoogleCalendarSettings> {
    return ApiService.invoke<GoogleCalendarSettings>('get_google_calendar_settings');
  }

  /**
   * Enable or disable automatic sync
   */
  static async updateSyncEnabled(enabled: boolean): Promise<GoogleCalendarSettings> {
    return ApiService.invoke<GoogleCalendarSettings>('update_sync_enabled', { enabled });
  }

  /**
   * Disconnect Google Calendar (clears tokens)
   */
  static async disconnect(): Promise<void> {
    return ApiService.invoke('disconnect_google_calendar');
  }

  /**
   * Revoke access and disconnect
   */
  static async revokeAccess(): Promise<void> {
    return ApiService.invoke('revoke_google_access');
  }

  /**
   * Trigger manual sync of appointments to Google Calendar
   */
  static async triggerSync(): Promise<SyncLog> {
    return ApiService.invoke<SyncLog>('trigger_manual_sync');
  }

  /**
   * Get sync history
   */
  static async getSyncHistory(limit: number = 10): Promise<SyncLog[]> {
    return ApiService.invoke<SyncLog[]>('get_sync_history', { limit });
  }

  /**
   * Check if sync is currently in progress
   */
  static async checkSyncStatus(): Promise<SyncLog | null> {
    return ApiService.invoke<SyncLog | null>('check_sync_status');
  }
}

// Export instance wrapper for backward compatibility with hooks
export const googleCalendarService = {
  startOAuthFlow: GoogleCalendarService.startOAuthFlow,
  completeOAuthFlow: GoogleCalendarService.completeOAuthFlow,
  cancelOAuthFlow: GoogleCalendarService.cancelOAuthFlow,
  checkOAuthCallback: GoogleCalendarService.checkOAuthCallback,
  getSettings: GoogleCalendarService.getSettings,
  updateSyncEnabled: GoogleCalendarService.updateSyncEnabled,
  disconnect: GoogleCalendarService.disconnect,
  revokeAccess: GoogleCalendarService.revokeAccess,
  triggerSync: GoogleCalendarService.triggerSync,
  getSyncHistory: GoogleCalendarService.getSyncHistory,
  checkSyncStatus: GoogleCalendarService.checkSyncStatus,
};
