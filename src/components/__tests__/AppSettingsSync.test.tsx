/**
 * app-shell #17: the theme had two sources. The window opened with the
 * localStorage theme (dark by default) and only took the saved setting once
 * Settings was opened. The saved setting wins from the start.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));

const getSettings = vi.hoisted(() => vi.fn());
vi.mock('../../services/settingsService', () => ({
  SettingsService: { getSettings, updateSettings: vi.fn() },
}));

import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import { AppSettingsSync } from '../AppSettingsSync';

function ThemeProbe() {
  return <div data-testid="theme">{useTheme().themeMode}</div>;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <App>
          <AppSettingsSync />
          <ThemeProbe />
        </App>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('AppSettingsSync', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('applies the saved theme at start, over the cached one', async () => {
    localStorage.setItem('themeMode', 'dark');
    getSettings.mockResolvedValue({
      settings: { language: 'en', theme: 'light', dateFormat: 'DD.MM.YYYY', currencyId: null },
    });

    renderApp();

    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('light'));
    expect(localStorage.getItem('themeMode')).toBe('light');
  });

  it('keeps the cached theme for the first paint', () => {
    localStorage.setItem('themeMode', 'light');
    getSettings.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(screen.getByTestId('theme').textContent).toBe('light');
  });
});
