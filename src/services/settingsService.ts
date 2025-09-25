import { invoke } from '@tauri-apps/api';

export interface AppSettings {
  id: number;
  userId: string;
  language: 'en' | 'mk';
  currencyId: number | null;
  theme: 'light' | 'dark';
  dateFormat: string;
  createdAt: string;
  updatedAt: string;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string | null;
}

export interface SettingsResponse {
  settings: AppSettings;
  currency?: Currency;
}

export interface UpdateSettingsRequest {
  language?: 'en' | 'mk';
  currencyId?: number;
  theme?: 'light' | 'dark';
  dateFormat?: string;
}

export class SettingsService {
  static async getSettings(): Promise<SettingsResponse> {
    try {
      return await invoke<SettingsResponse>('get_app_settings');
    } catch (error) {
      console.error('Failed to get settings:', error);
      // Return default settings
      return {
        settings: {
          id: 0,
          userId: 'default',
          language: 'en',
          currencyId: null,
          theme: 'light',
          dateFormat: 'MM/DD/YYYY',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }
  }

  static async updateSettings(updates: UpdateSettingsRequest): Promise<SettingsResponse> {
    console.log('SettingsService.updateSettings called with:', updates);

    // Wrap the updates in an object to match the Tauri command's expected parameter
    return await invoke<SettingsResponse>('update_app_settings', {
      updates: {
        language: updates.language,
        currencyId: updates.currencyId,
        theme: updates.theme,
        dateFormat: updates.dateFormat
      }
    });
  }

  static async getCurrencies(): Promise<Currency[]> {
    return await invoke<Currency[]>('get_currencies');
  }
}