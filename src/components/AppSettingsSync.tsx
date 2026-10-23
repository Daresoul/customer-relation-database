import { useAppSettings } from '../hooks/useAppSettings';

/**
 * Loads the saved settings at start and applies language, theme and date
 * format, so they don't wait for the Settings page to be opened. The theme
 * in localStorage is only a cache for the first paint.
 */
export function AppSettingsSync() {
  useAppSettings();
  return null;
}
