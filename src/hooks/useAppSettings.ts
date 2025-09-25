import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsService, UpdateSettingsRequest } from '../services/settingsService';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { message } from 'antd';
import { updateDateFormatInStorage } from '../utils/dateFormatter';
import { useTheme } from '../contexts/ThemeContext';

export const useAppSettings = () => {
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
        // Force re-render of components using dates
        queryClient.invalidateQueries();
      }

      message.success(i18n.t('common:updateSuccess'));
    },
    onError: (error) => {
      console.error('Failed to update settings:', error);
      message.error(i18n.t('common:operationFailed'));
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