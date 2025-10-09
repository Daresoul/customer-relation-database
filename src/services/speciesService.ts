import { invoke } from '@tauri-apps/api';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../types/species';

export class SpeciesService {
  static async getSpecies(activeOnly?: boolean): Promise<Species[]> {
    try {
      return await invoke<Species[]>('get_species', { activeOnly });
    } catch (error) {
      console.error('Failed to get species:', error);
      throw error;
    }
  }

  static async getSpeciesById(id: number): Promise<Species> {
    try {
      return await invoke<Species>('get_species_by_id', { id });
    } catch (error) {
      console.error('Failed to get species:', error);
      throw error;
    }
  }

  static async createSpecies(data: CreateSpeciesInput): Promise<Species> {
    try {
      return await invoke<Species>('create_species', { input: data });
    } catch (error) {
      console.error('Failed to create species:', error);
      throw error;
    }
  }

  static async updateSpecies(id: number, data: UpdateSpeciesInput): Promise<Species> {
    try {
      return await invoke<Species>('update_species', { id, input: data });
    } catch (error) {
      console.error('Failed to update species:', error);
      throw error;
    }
  }

  static async deleteSpecies(id: number, hardDelete?: boolean): Promise<void> {
    try {
      await invoke<void>('delete_species', { id, hardDelete });
    } catch (error) {
      console.error('Failed to delete species:', error);
      throw error;
    }
  }
}
