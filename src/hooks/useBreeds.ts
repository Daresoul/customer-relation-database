import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { BreedService } from '../services/breedService';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../types/breed';
import { createMutationErrorHandler } from '../utils/errors';

export const useBreeds = (speciesId?: number, activeOnly: boolean = true) => {
  return useQuery({
    queryKey: ['breeds', speciesId, activeOnly],
    queryFn: () => BreedService.getBreeds(speciesId, activeOnly),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useBreed = (id: number) => {
  return useQuery({
    queryKey: ['breed', id],
    queryFn: () => BreedService.getBreed(id),
    enabled: !!id,
  });
};

export const useCreateBreed = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBreedInput) => BreedService.createBreed(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
      notification.success({
        message: 'Breed Created',
        description: 'Breed created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Breed', t, 'useBreeds'),
  });
};

export const useUpdateBreed = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBreedInput }) =>
      BreedService.updateBreed(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
      notification.success({
        message: 'Breed Updated',
        description: 'Breed updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Breed', t, 'useBreeds'),
  });
};

export const useDeleteBreed = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, hardDelete }: { id: number; hardDelete?: boolean }) =>
      BreedService.deleteBreed(id, hardDelete ?? false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
      notification.success({
        message: 'Breed Deleted',
        description: 'Breed deleted successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Delete Breed', t, 'useBreeds'),
  });
};
