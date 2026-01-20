import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { SpeciesService } from '../services/speciesService';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../types/species';
import { createMutationErrorHandler } from '../utils/errors';

export const useSpecies = (activeOnly: boolean = true) => {
  return useQuery({
    queryKey: ['species', activeOnly],
    queryFn: () => SpeciesService.getSpecies(activeOnly),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useSpeciesById = (id: number) => {
  return useQuery({
    queryKey: ['species', id],
    queryFn: () => SpeciesService.getSpeciesById(id),
    enabled: !!id,
  });
};

export const useCreateSpecies = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSpeciesInput) => SpeciesService.createSpecies(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['species'] });
      notification.success({
        message: 'Species Created',
        description: 'Species created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Species', t, 'useSpecies'),
  });
};

export const useUpdateSpecies = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSpeciesInput }) =>
      SpeciesService.updateSpecies(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['species'] });
      notification.success({
        message: 'Species Updated',
        description: 'Species updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Species', t, 'useSpecies'),
  });
};

export const useDeleteSpecies = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, hardDelete }: { id: number; hardDelete?: boolean }) =>
      SpeciesService.deleteSpecies(id, hardDelete),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['species'] });
      notification.success({
        message: 'Species Deleted',
        description: 'Species deleted successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Delete Species', t, 'useSpecies'),
  });
};
