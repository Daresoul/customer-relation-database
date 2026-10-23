import { ApiService } from './api';

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
  /** null clears the currency; left out keeps it. */
  currencyId?: number | null;
  theme?: 'light' | 'dark';
  dateFormat?: string;
}

export class SettingsService {
  /** Throws when the settings can't be read; callers show the error. */
  static async getSettings(): Promise<SettingsResponse> {
    return ApiService.invoke<SettingsResponse>('get_app_settings');
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
