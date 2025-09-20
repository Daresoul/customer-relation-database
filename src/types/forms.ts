/**
 * Form input types for creating and updating records
 */

export interface CreatePatientInput {
  name: string;
  species: string;
  breed?: string;
  dateOfBirth?: string;
  color?: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  weight?: number;
  microchipId?: string;
  notes?: string;
  householdId?: number; // Initial household assignment
}

export interface UpdatePatientInput {
  name?: string;
  species?: string;
  breed?: string;
  dateOfBirth?: string;
  color?: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  weight?: number;
  microchipId?: string;
  notes?: string;
  isActive?: boolean;
}