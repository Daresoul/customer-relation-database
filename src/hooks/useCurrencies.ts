import { useQuery } from '@tanstack/react-query';
import { SettingsService } from '../services/settingsService';

export const useCurrencies = () => {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: SettingsService.getCurrencies,
    staleTime: 30 * 60 * 1000, // 30 minutes - currencies don't change often
  });
};