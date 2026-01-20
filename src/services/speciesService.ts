import { ApiService } from './api';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../types/species';

export class SpeciesService {
  static async getSpecies(activeOnly?: boolean): Promise<Species[]> {
    return ApiService.invoke<Species[]>('get_species', { activeOnly });
  }

  static async getSpeciesById(id: number): Promise<Species> {
    return ApiService.invoke<Species>('get_species_by_id', { id });
  }

  static async createSpecies(data: CreateSpeciesInput): Promise<Species> {
    return ApiService.invoke<Species>('create_species', { input: data });
  }

  static async updateSpecies(id: number, data: UpdateSpeciesInput): Promise<Species> {
    return ApiService.invoke<Species>('update_species', { id, input: data });
  }

  static async deleteSpecies(id: number, hardDelete?: boolean): Promise<void> {
    return ApiService.invoke<void>('delete_species', { id, hardDelete });
  }
}
