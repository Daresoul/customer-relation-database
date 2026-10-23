import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { ClinicService } from '../services/clinicService';
import type { UpdateClinicProfileInput, CreateTaxRateInput, UpdateTaxRateInput, MoneyLine } from '../types/clinic';
import { createMutationErrorHandler } from '../utils/errors';

const PROFILE_KEY = ['clinicProfile'];
const LOGO_KEY = ['clinicLogo'];
const RATES_KEY = ['taxRates'];

export const useClinicProfile = () =>
  useQuery({ queryKey: PROFILE_KEY, queryFn: ClinicService.getProfile, staleTime: 5 * 60 * 1000 });

export const useClinicLogo = () =>
  useQuery({ queryKey: LOGO_KEY, queryFn: ClinicService.getLogo, staleTime: 5 * 60 * 1000 });

export const useUpdateClinicProfile = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClinicProfileInput) => ClinicService.updateProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      // The price mode changes every total on screen.
      queryClient.invalidateQueries({ queryKey: ['invoiceTotals'] });
    },
    onError: createMutationErrorHandler(notification, 'saveClinicProfile', t, 'useClinic'),
  });
};

export const useSetClinicLogo = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => ClinicService.setLogo(path),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      queryClient.invalidateQueries({ queryKey: LOGO_KEY });
    },
    onError: createMutationErrorHandler(notification, 'saveClinicLogo', t, 'useClinic'),
  });
};

export const useRemoveClinicLogo = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ClinicService.removeLogo(),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      queryClient.setQueryData(LOGO_KEY, null);
    },
    onError: createMutationErrorHandler(notification, 'removeClinicLogo', t, 'useClinic'),
  });
};

export const useTaxRates = (activeOnly = false) =>
  useQuery({
    queryKey: [...RATES_KEY, activeOnly],
    queryFn: () => ClinicService.getTaxRates(activeOnly),
    staleTime: 5 * 60 * 1000,
  });

export const useCreateTaxRate = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaxRateInput) => ClinicService.createTaxRate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RATES_KEY }),
    onError: createMutationErrorHandler(notification, 'saveTaxRate', t, 'useClinic'),
  });
};

export const useUpdateTaxRate = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTaxRateInput }) => ClinicService.updateTaxRate(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RATES_KEY }),
    onError: createMutationErrorHandler(notification, 'saveTaxRate', t, 'useClinic'),
  });
};

/**
 * Totals of the lines on screen, from the backend's money math, so the
 * screen shows what the invoice PDF will print.
 */
export const useInvoiceTotals = (lines: MoneyLine[], discountPercent: number | null | undefined) =>
  useQuery({
    queryKey: ['invoiceTotals', lines, discountPercent ?? null],
    queryFn: () => ClinicService.calculateTotals(lines, discountPercent),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
  });
