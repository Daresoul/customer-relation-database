import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@/services/invoke';
import { DeviceIntegrationService } from '../services/deviceIntegrationService';
import { DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput, DeviceConnectionStatus, FileWatcherStatus } from '../types/deviceIntegration';
import { createMutationErrorHandler } from '../utils/errors';

export const useDeviceIntegrations = () => {
  return useQuery({
    queryKey: ['device-integrations'],
    queryFn: () => DeviceIntegrationService.getDeviceIntegrations(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useDeviceIntegration = (id: number) => {
  return useQuery({
    queryKey: ['device-integration', id],
    queryFn: () => DeviceIntegrationService.getDeviceIntegration(id),
    enabled: !!id,
  });
};

export const useCreateDeviceIntegration = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDeviceIntegrationInput) => DeviceIntegrationService.createDeviceIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: t('devices:notifications.integrationCreated'),
        description: t('devices:notifications.integrationCreatedDesc'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'createDeviceIntegration', t, 'useDeviceIntegrations'),
  });
};

export const useUpdateDeviceIntegration = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDeviceIntegrationInput }) =>
      DeviceIntegrationService.updateDeviceIntegration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['device-integration'] });
      notification.success({
        message: t('devices:notifications.integrationUpdated'),
        description: t('devices:notifications.integrationUpdatedDesc'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'updateDeviceIntegration', t, 'useDeviceIntegrations'),
  });
};

export const useDeleteDeviceIntegration = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => DeviceIntegrationService.deleteDeviceIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: t('devices:notifications.integrationDeleted'),
        description: t('devices:notifications.integrationDeletedDesc'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'deleteDeviceIntegration', t, 'useDeviceIntegrations'),
  });
};

export const useToggleDeviceIntegration = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => DeviceIntegrationService.toggleDeviceIntegrationEnabled(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: t('devices:notifications.integrationToggled'),
        description: t('devices:notifications.integrationToggledDesc'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'toggleDeviceIntegration', t, 'useDeviceIntegrations'),
  });
};

// Hook to track device connection statuses with real-time updates
export const useDeviceConnectionStatus = () => {
  const [statuses, setStatuses] = useState<Map<number, DeviceConnectionStatus>>(new Map());

  // Fetch initial statuses
  const fetchStatuses = useCallback(async () => {
    try {
      const statusList = await invoke<DeviceConnectionStatus[]>('get_device_connection_statuses');
      const statusMap = new Map<number, DeviceConnectionStatus>();
      statusList.forEach((status) => {
        statusMap.set(status.integration_id, status);
      });
      setStatuses(statusMap);
    } catch (_error) {
      // Silently fail - statuses are not critical
    }
  }, []);

  useEffect(() => {
    // Fetch initial statuses
    fetchStatuses();

    // Listen for status updates
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<DeviceConnectionStatus>('device-connection-status', (event) => {
        const status = event.payload;
        setStatuses((prev) => {
          const newMap = new Map(prev);
          newMap.set(status.integration_id, status);
          return newMap;
        });
      });
    };

    setupListener();

    // Refresh statuses periodically (every 10 seconds)
    const interval = setInterval(fetchStatuses, 10000);

    return () => {
      if (unlisten) {
        unlisten();
      }
      clearInterval(interval);
    };
  }, [fetchStatuses]);

  // Get status for a specific integration
  const getStatus = useCallback(
    (integrationId: number): DeviceConnectionStatus | undefined => {
      return statuses.get(integrationId);
    },
    [statuses]
  );

  return {
    statuses,
    getStatus,
    refetch: fetchStatuses,
  };
};

// Hook to track file watcher statuses with real-time updates
export const useFileWatcherStatus = () => {
  const [statuses, setStatuses] = useState<Map<number, FileWatcherStatus>>(new Map());

  // Fetch initial statuses
  const fetchStatuses = useCallback(async () => {
    try {
      const statusList = await invoke<FileWatcherStatus[]>('get_file_watcher_statuses');
      const statusMap = new Map<number, FileWatcherStatus>();
      statusList.forEach((status) => {
        statusMap.set(status.integration_id, status);
      });
      setStatuses(statusMap);
    } catch (_error) {
      // Silently fail - statuses are not critical
    }
  }, []);

  useEffect(() => {
    // Fetch initial statuses
    fetchStatuses();

    // Listen for status updates
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<FileWatcherStatus>('file-watcher-status', (event) => {
        const status = event.payload;
        setStatuses((prev) => {
          const newMap = new Map(prev);
          newMap.set(status.integration_id, status);
          return newMap;
        });
      });
    };

    setupListener();

    // Refresh statuses periodically (every 30 seconds for file watchers)
    const interval = setInterval(fetchStatuses, 30000);

    return () => {
      if (unlisten) {
        unlisten();
      }
      clearInterval(interval);
    };
  }, [fetchStatuses]);

  // Get status for a specific integration
  const getStatus = useCallback(
    (integrationId: number): FileWatcherStatus | undefined => {
      return statuses.get(integrationId);
    },
    [statuses]
  );

  return {
    statuses,
    getStatus,
    refetch: fetchStatuses,
  };
};
