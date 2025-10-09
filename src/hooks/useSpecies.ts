import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { SpeciesService } from '../services/speciesService';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../types/species';

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
    onError: (error: any) => {
      console.error('Create species error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Create Species',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useUpdateSpecies = () => {
  const { notification } = App.useApp();
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
    onError: (error: any) => {
      console.error('Update species error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Update Species',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};

export const useDeleteSpecies = () => {
  const { notification } = App.useApp();
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
    onError: (error: any) => {
      console.error('Delete species error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error({
        message: 'Failed to Delete Species',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    },
  });
};
