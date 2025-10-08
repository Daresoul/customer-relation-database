// T032: React Query hooks for Google Calendar
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { googleCalendarService } from '../services/googleCalendarService';
import type { GoogleCalendarSettings, SyncLog } from '../types/googleCalendar';

const QUERY_KEYS = {
  settings: ['google_calendar', 'settings'],
  syncHistory: (limit: number) => ['google_calendar', 'sync_history', limit],
  syncStatus: ['google_calendar', 'sync_status'],
};

/**
 * Query hook for Google Calendar settings
 */
export function useGoogleCalendarSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: () => googleCalendarService.getSettings(),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Mutation hook for starting OAuth flow
 */
export function useStartOAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.startOAuthFlow(),
    onSuccess: () => {
      // OAuth flow started, settings may change after completion
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
  });
}

/**
 * Mutation hook for completing OAuth flow
 */
export function useCompleteOAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) =>
      googleCalendarService.completeOAuthFlow(code, state),
    onSuccess: (data: GoogleCalendarSettings) => {
      // Update cache with new settings
      queryClient.setQueryData(QUERY_KEYS.settings, data);
    },
  });
}

/**
 * Mutation hook for updating sync enabled status
 */
export function useUpdateSyncEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) => googleCalendarService.updateSyncEnabled(enabled),
    onSuccess: (data: GoogleCalendarSettings) => {
      // Update cache with new settings
      queryClient.setQueryData(QUERY_KEYS.settings, data);
    },
  });
}

/**
 * Mutation hook for disconnecting Google Calendar
 */
export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.disconnect(),
    onSuccess: () => {
      // Invalidate settings to refetch
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
  });
}

/**
 * Mutation hook for revoking Google access
 */
export function useRevokeGoogleAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.revokeAccess(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
  });
}

/**
 * Mutation hook for triggering manual sync
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.triggerSync(),
    onSuccess: () => {
      // Invalidate sync history and status
      queryClient.invalidateQueries({ queryKey: ['google_calendar', 'sync_history'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
  });
}

/**
 * Query hook for sync history
 */
export function useSyncHistory(limit: number = 10) {
  return useQuery({
    queryKey: QUERY_KEYS.syncHistory(limit),
    queryFn: () => googleCalendarService.getSyncHistory(limit),
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Query hook for checking current sync status
 */
export function useSyncStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.syncStatus,
    queryFn: () => googleCalendarService.checkSyncStatus(),
    refetchInterval: (data) => {
      // Poll every 2 seconds if sync is in progress
      return data?.status === 'in_progress' ? 2000 : false;
    },
  });
}
