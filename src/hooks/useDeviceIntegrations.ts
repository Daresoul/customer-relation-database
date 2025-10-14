import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { DeviceIntegrationService } from '../services/deviceIntegrationService';
import { DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput } from '../types/deviceIntegration';

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
