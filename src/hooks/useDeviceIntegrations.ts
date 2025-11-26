import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useEffect, useState, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api';
import { DeviceIntegrationService } from '../services/deviceIntegrationService';
import { DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput, DeviceConnectionStatus, FileWatcherStatus } from '../types/deviceIntegration';

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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDeviceIntegrationInput) => DeviceIntegrationService.createDeviceIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: 'Device Integration Created',
        description: 'Device integration created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error: any) => {
      console.error('Create device integration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Create Device Integration',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useUpdateDeviceIntegration = () => {
  const { notification } = App.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDeviceIntegrationInput }) =>
      DeviceIntegrationService.updateDeviceIntegration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['device-integration'] });
      notification.success({
        message: 'Device Integration Updated',
        description: 'Device integration updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error: any) => {
      console.error('Update device integration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Update Device Integration',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useDeleteDeviceIntegration = () => {
  const { notification } = App.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => DeviceIntegrationService.deleteDeviceIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: 'Device Integration Deleted',
        description: 'Device integration deleted successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error: any) => {
      console.error('Delete device integration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Delete Device Integration',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useToggleDeviceIntegration = () => {
  const { notification } = App.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => DeviceIntegrationService.toggleDeviceIntegrationEnabled(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-integrations'] });
      notification.success({
        message: 'Device Integration Toggled',
        description: 'Device integration enabled/disabled successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error: any) => {
      console.error('Toggle device integration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Toggle Device Integration',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
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
