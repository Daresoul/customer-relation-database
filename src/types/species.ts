export interface Species {
  id: number;
  name: string;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSpeciesInput {
  name: string;
  display_order?: number;
}

export interface UpdateSpeciesInput {
  name?: string;
  active?: boolean;
  display_order?: number;
}
