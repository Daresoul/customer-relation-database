import { ApiService } from './api';
import { DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput } from '../types/deviceIntegration';

export class DeviceIntegrationService {
  static async getDeviceIntegrations(): Promise<DeviceIntegration[]> {
    return ApiService.invoke('get_device_integrations');
  }

  static async getDeviceIntegration(id: number): Promise<DeviceIntegration> {
    return ApiService.invoke('get_device_integration', { id });
  }

  static async createDeviceIntegration(data: CreateDeviceIntegrationInput): Promise<DeviceIntegration> {
    return ApiService.invoke('create_device_integration', { input: data });
  }

  static async updateDeviceIntegration(id: number, data: UpdateDeviceIntegrationInput): Promise<DeviceIntegration> {
    return ApiService.invoke('update_device_integration', { id, input: data });
  }

  static async deleteDeviceIntegration(id: number): Promise<void> {
    return ApiService.invoke('delete_device_integration', { id });
  }

  static async toggleDeviceIntegrationEnabled(id: number): Promise<DeviceIntegration> {
    return ApiService.invoke('toggle_device_integration_enabled', { id });
  }
}
