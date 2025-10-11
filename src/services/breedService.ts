import { invoke } from '@tauri-apps/api/tauri';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../types/breed';

export class BreedService {
  static async getBreeds(speciesId?: number, activeOnly?: boolean): Promise<Breed[]> {
    console.log('🔍 BreedService.getBreeds called:', { speciesId, activeOnly });

    // Send filter object to match Rust BreedFilter struct
    const filter = {
      species_id: speciesId !== undefined ? speciesId : null,
      active_only: activeOnly !== undefined ? activeOnly : null
    };

    console.log('🔍 Sending to backend:', JSON.stringify({ filter }));
    const result = await invoke('get_breeds', { filter });
    console.log('🔍 Backend returned:', result);
    return result;
  }

  static async getBreed(id: number): Promise<Breed> {
    return await invoke('get_breed', { id });
  }

  static async createBreed(data: CreateBreedInput): Promise<Breed> {
    return await invoke('create_breed', { data });
  }

  static async updateBreed(id: number, data: UpdateBreedInput): Promise<Breed> {
    return await invoke('update_breed', { id, data });
  }

  static async deleteBreed(id: number, hardDelete: boolean = false): Promise<void> {
    return await invoke('delete_breed', { id, hard_delete: hardDelete });
  }
}
