import { invoke } from '@tauri-apps/api/tauri';
import {
  DeviceIntegration,
  CreateDeviceIntegrationInput,
  UpdateDeviceIntegrationInput
} from '../types/deviceIntegration';

export class DeviceIntegrationService {
  static async getDeviceIntegrations(): Promise<DeviceIntegration[]> {
    return await invoke('get_device_integrations');
  }

  static async getDeviceIntegration(id: number): Promise<DeviceIntegration> {
    return await invoke('get_device_integration', { id });
  }

  static async createDeviceIntegration(data: CreateDeviceIntegrationInput): Promise<DeviceIntegration> {
    return await invoke('create_device_integration', { input: data });
  }

  static async updateDeviceIntegration(id: number, data: UpdateDeviceIntegrationInput): Promise<DeviceIntegration> {
    return await invoke('update_device_integration', { id, input: data });
  }

  static async deleteDeviceIntegration(id: number): Promise<void> {
    return await invoke('delete_device_integration', { id });
  }

  static async toggleDeviceIntegrationEnabled(id: number): Promise<DeviceIntegration> {
    return await invoke('toggle_device_integration_enabled', { id });
  }
}
