import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsService, UpdateSettingsRequest } from '../services/settingsService';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { App } from 'antd';
import { updateDateFormatInStorage } from '../utils/dateFormatter';
import { useTheme } from '../contexts/ThemeContext';

export const useAppSettings = () => {
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const { setThemeMode } = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: SettingsService.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const updateSettings = useMutation({
    mutationFn: SettingsService.updateSettings,
    onSuccess: (newSettings) => {
      queryClient.setQueryData(['settings'], newSettings);

      // Update i18n language if changed
      if (newSettings.settings.language !== data?.settings.language) {
        i18n.changeLanguage(newSettings.settings.language);
        // Persist to localStorage as well
        localStorage.setItem('veterinary-clinic-language', newSettings.settings.language);
      }

      // Update theme if changed
      if (newSettings.settings.theme !== data?.settings.theme) {
        const theme = newSettings.settings.theme as 'light' | 'dark';
        setThemeMode(theme);
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('veterinary-clinic-theme', theme);
      }

      // Update date format if changed
      if (newSettings.settings.dateFormat !== data?.settings.dateFormat) {
        updateDateFormatInStorage(newSettings.settings.dateFormat);
        // Invalidate only settings query - components will re-render via React Query
        queryClient.invalidateQueries({ queryKey: ['settings'] });
      }

      notification.success({
        message: 'Settings Updated',
        description: i18n.t('common:updateSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error) => {
      console.error('Failed to update settings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Update Settings',
        description: `${i18n.t('common:operationFailed')}: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });

  // Apply settings on load
  useEffect(() => {
    if (data?.settings) {
      // Apply language
      if (data.settings.language !== i18n.language) {
        i18n.changeLanguage(data.settings.language);
        localStorage.setItem('veterinary-clinic-language', data.settings.language);
      }

      // Apply theme to ThemeContext
      const theme = data.settings.theme as 'light' | 'dark';
      setThemeMode(theme);
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('veterinary-clinic-theme', theme);

      // Apply date format
      updateDateFormatInStorage(data.settings.dateFormat);
    }
  }, [data, i18n, setThemeMode]);

  return {
    settings: data?.settings,
    currency: data?.currency,
    isLoading,
    error,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending,
  };
};