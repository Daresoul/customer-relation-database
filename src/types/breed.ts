export interface Breed {
  id: number;
  name: string;
  speciesId: number;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBreedInput {
  name: string;
  speciesId: number;
}

export interface UpdateBreedInput {
  name?: string;
  speciesId?: number;
  active?: boolean;
}
