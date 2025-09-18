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
  ownerId?: number; // Initial owner assignment
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

export interface CreateOwnerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
}

export interface UpdateOwnerInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
}

export interface AddOwnerRelationshipInput {
  patientId: number;
  ownerId: number;
  isPrimary?: boolean;
  relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact';
}