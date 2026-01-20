/**
 * Hook for managing households using React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { HouseholdService } from '../services/householdService';
import { HouseholdSearchResult } from '../types';
import type { HouseholdWithPeople, CreateHouseholdWithPeopleDto } from '../types/household';
import { createMutationErrorHandler } from '../utils/errors';

const HOUSEHOLDS_KEY = 'households';

export const useHouseholds = () => {
  return useQuery({
    queryKey: [HOUSEHOLDS_KEY],
    queryFn: async (): Promise<HouseholdSearchResult[]> => {
      // Use search with empty-ish query to get all households
      // The backend handles this case by returning all households
      try {
        const response = await HouseholdService.searchHouseholds('*', 100, 0);
        return response.results.map((result) => ({
          id: result.id,
          householdName: result.householdName || 'Unnamed Household',
          address: result.address,
          city: undefined,
          postalCode: undefined,
          contacts: result.people?.flatMap((person) =>
            person.contacts?.map((contact) => ({
              type: contact.contactType as 'phone' | 'email' | 'mobile' | 'work',
              value: contact.contactValue,
              isPrimary: contact.isPrimary
            })) || []
          ) || [],
          petCount: 0,
          relevanceScore: 1.0
        }));
      } catch {
        // Fallback: return empty array if search fails
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useHousehold = (householdId: number | undefined) => {
  return useQuery({
    queryKey: [HOUSEHOLDS_KEY, 'detail', householdId],
    queryFn: () => householdId ? HouseholdService.getHouseholdWithPeople(householdId) : null,
    enabled: !!householdId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateHousehold = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateHouseholdWithPeopleDto) =>
      HouseholdService.createHouseholdWithPeople(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [HOUSEHOLDS_KEY] });
      notification.success({
        message: 'Household Created',
        description: `${data.household.householdName || 'New household'} has been created`,
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Household', t, 'useHouseholds'),
  });
};

export const useUpdateHousehold = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ householdId, updates }: {
      householdId: number;
      updates: { householdName?: string; address?: string; notes?: string };
    }) => HouseholdService.updateHousehold(householdId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [HOUSEHOLDS_KEY] });
      notification.success({
        message: 'Household Updated',
        description: 'Household information has been saved',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Household', t, 'useHouseholds'),
  });
};

export const useDeleteHousehold = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (householdId: number) => HouseholdService.deleteHousehold(householdId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [HOUSEHOLDS_KEY] });
      notification.success({
        message: 'Household Deleted',
        description: 'Household has been removed',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Delete Household', t, 'useHouseholds'),
  });
};

export const useSearchHouseholds = (query: string, limit?: number) => {
  return useQuery({
    queryKey: [HOUSEHOLDS_KEY, 'search', query, limit],
    queryFn: () => HouseholdService.searchHouseholds(query, limit),
    enabled: query.length >= 2,
    staleTime: 30 * 1000, // 30 seconds for search results
  });
};

export const useQuickSearchHouseholds = (query: string, limit?: number) => {
  return useQuery({
    queryKey: [HOUSEHOLDS_KEY, 'quickSearch', query, limit],
    queryFn: () => HouseholdService.quickSearchHouseholds(query, limit),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
};
