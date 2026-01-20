import { ApiService } from './api';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../types/breed';

export class BreedService {
  static async getBreeds(speciesId?: number, activeOnly?: boolean): Promise<Breed[]> {
    const filter = {
      speciesId: speciesId ?? null,
      activeOnly: activeOnly ?? null
    };
    return ApiService.invoke('get_breeds', { filter });
  }

  static async getBreed(id: number): Promise<Breed> {
    return ApiService.invoke('get_breed', { id });
  }

  static async createBreed(data: CreateBreedInput): Promise<Breed> {
    return ApiService.invoke('create_breed', { data });
  }

  static async updateBreed(id: number, data: UpdateBreedInput): Promise<Breed> {
    return ApiService.invoke('update_breed', { id, data });
  }

  static async deleteBreed(id: number, hardDelete: boolean = false): Promise<void> {
    return ApiService.invoke('delete_breed', { id, hardDelete });
  }
}
