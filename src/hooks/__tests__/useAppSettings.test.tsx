import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

const getSettings = vi.fn();
const updateSettings = vi.fn();
vi.mock('../../services/settingsService', () => ({
  SettingsService: {
    getSettings: (...a: unknown[]) => getSettings(...a),
    updateSettings: (...a: unknown[]) => updateSettings(...a),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn(), t: (key: string) => key },
  }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ setThemeMode: vi.fn() }),
}));

import { useAppSettings } from '../useAppSettings';

const settings = { language: 'en', theme: 'light', dateFormat: 'DD/MM/YYYY', currencyId: 1 };

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

describe('useAppSettings.updateSettings', () => {
  beforeEach(() => {
    getSettings.mockResolvedValue({ settings });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('rejects when the backend refuses the save', async () => {
    updateSettings.mockRejectedValue(new Error('database is locked'));
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await expect(result.current.updateSettings({ ...settings, theme: 'dark' } as never)).rejects.toThrow('database is locked');
  });

  it('resolves only after the backend confirms, without a toast of its own', async () => {
    updateSettings.mockResolvedValue({ settings: { ...settings, theme: 'dark' } });
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      await result.current.updateSettings({ ...settings, theme: 'dark' } as never);
    });

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Settings Updated');
  });
});
