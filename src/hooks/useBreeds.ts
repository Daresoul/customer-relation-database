import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BreedService } from '../services/breedService';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../types/breed';

export const useBreeds = (speciesId?: number, activeOnly: boolean = true) => {
  return useQuery({
    queryKey: ['breeds', speciesId, activeOnly],
    queryFn: () => BreedService.getBreeds(speciesId, activeOnly),
    enabled: speciesId !== undefined, // Only fetch when we have a species ID
    staleTime: 1000 * 60 * 5, // 5 minutes
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBreedInput) => BreedService.createBreed(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
    },
  });
};

export const useUpdateBreed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBreedInput }) =>
      BreedService.updateBreed(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
    },
  });
};

export const useDeleteBreed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, hardDelete }: { id: number; hardDelete?: boolean }) =>
      BreedService.deleteBreed(id, hardDelete ?? false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeds'] });
    },
  });
};
