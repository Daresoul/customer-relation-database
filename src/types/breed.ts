export interface Breed {
  id: number;
  name: string;
  species_id: number;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBreedInput {
  name: string;
  species_id: number;
}

export interface UpdateBreedInput {
  name?: string;
  species_id?: number;
  active?: boolean;
}
