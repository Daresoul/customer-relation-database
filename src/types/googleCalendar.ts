// T030: TypeScript interfaces for Google Calendar integration

export interface GoogleCalendarSettings {
  connected: boolean;
  connected_email?: string;
  calendar_id?: string;
  sync_enabled: boolean;
  last_sync?: string;
}

export interface CalendarEventMapping {
  id: number;
  appointment_id: number;
  event_id: string;
  calendar_id: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  direction: 'to_google' | 'from_google';
  sync_type: 'initial' | 'incremental' | 'manual';
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'partial';
  items_synced: number;
  items_failed: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface OAuthFlowState {
  auth_url: string;
  state: string;
  redirect_port: number;
}

export interface UpdateSettingsInput {
  sync_enabled?: boolean;
}
