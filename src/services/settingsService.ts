import { ApiService } from './api';

export interface AppSettings {
  id: number;
  userId: string;
  language: 'en' | 'mk';
  currencyId: number | null;
  theme: 'light' | 'dark';
  dateFormat: string;
  googleCalendarSync?: boolean;
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
  googleCalendarSync?: boolean;
}

export class SettingsService {
  static async getSettings(): Promise<SettingsResponse> {
    try {
      return await ApiService.invoke<SettingsResponse>('get_app_settings');
    } catch {
      // Return default settings on error
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
    return ApiService.invoke<SettingsResponse>('update_app_settings', {
      updates: {
        language: updates.language,
        currencyId: updates.currencyId,
        theme: updates.theme,
        dateFormat: updates.dateFormat
      }
    });
  }

  static async getCurrencies(): Promise<Currency[]> {
    return ApiService.invoke<Currency[]>('get_currencies');
  }
}
