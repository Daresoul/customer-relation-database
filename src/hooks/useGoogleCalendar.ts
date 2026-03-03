// T032: React Query hooks for Google Calendar
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { googleCalendarService } from '../services/googleCalendarService';
import type { GoogleCalendarSettings, SyncLog } from '../types/googleCalendar';
import { createMutationErrorHandler } from '../utils/errors';

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
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.startOAuthFlow(),
    onSuccess: () => {
      // OAuth flow started, settings may change after completion
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
    onError: createMutationErrorHandler(notification, 'Start Google Sign-In', t, 'useGoogleCalendar'),
  });
}

/**
 * Mutation hook for completing OAuth flow
 */
export function useCompleteOAuth() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) =>
      googleCalendarService.completeOAuthFlow(code, state),
    onSuccess: (data: GoogleCalendarSettings) => {
      notification.success({
        message: 'Google Calendar Connected',
        description: 'Successfully connected to Google Calendar',
        placement: 'bottomRight',
        duration: 3,
      });
      // Update cache with new settings
      queryClient.setQueryData(QUERY_KEYS.settings, data);
    },
    onError: createMutationErrorHandler(notification, 'Connect Google Calendar', t, 'useGoogleCalendar'),
  });
}

/**
 * Mutation hook for updating sync enabled status
 */
export function useUpdateSyncEnabled() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) => googleCalendarService.updateSyncEnabled(enabled),
    onSuccess: (data: GoogleCalendarSettings) => {
      notification.success({
        message: data.sync_enabled ? 'Sync Enabled' : 'Sync Disabled',
        description: data.sync_enabled
          ? 'Google Calendar sync has been enabled'
          : 'Google Calendar sync has been disabled',
        placement: 'bottomRight',
        duration: 3,
      });
      // Update cache with new settings
      queryClient.setQueryData(QUERY_KEYS.settings, data);
    },
    onError: createMutationErrorHandler(notification, 'Update Sync Settings', t, 'useGoogleCalendar'),
  });
}

/**
 * Mutation hook for disconnecting Google Calendar
 */
export function useDisconnectGoogleCalendar() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.disconnect(),
    onSuccess: () => {
      notification.success({
        message: 'Google Calendar Disconnected',
        description: 'Successfully disconnected from Google Calendar',
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate settings to refetch
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
    onError: createMutationErrorHandler(notification, 'Disconnect Google Calendar', t, 'useGoogleCalendar'),
  });
}

/**
 * Mutation hook for revoking Google access
 */
export function useRevokeGoogleAccess() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.revokeAccess(),
    onSuccess: () => {
      notification.success({
        message: 'Google Access Revoked',
        description: 'Successfully revoked Google Calendar access',
        placement: 'bottomRight',
        duration: 3,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
    onError: createMutationErrorHandler(notification, 'Revoke Google Access', t, 'useGoogleCalendar'),
  });
}

/**
 * Mutation hook for triggering manual sync
 */
export function useTriggerSync() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => googleCalendarService.triggerSync(),
    onSuccess: () => {
      notification.success({
        message: 'Sync Started',
        description: 'Google Calendar sync has been initiated',
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate sync history and status
      queryClient.invalidateQueries({ queryKey: ['google_calendar', 'sync_history'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
    onError: createMutationErrorHandler(notification, 'Start Sync', t, 'useGoogleCalendar'),
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
    refetchInterval: (query) => {
      // Poll every 2 seconds if sync is in progress
      return query.state.data?.status === 'in_progress' ? 2000 : false;
    },
  });
}
