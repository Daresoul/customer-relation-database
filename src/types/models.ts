/**
 * Core data models for the veterinary clinic management system
 */

export interface Patient {
  id: number;
  name: string;
  species: string;
  breed?: string;
  dateOfBirth?: string;
  color?: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  weight?: number;
  microchipId?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Owner {
  id: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface PatientOwner {
  patientId: number;
  ownerId: number;
  isPrimary: boolean;
  relationshipType: 'Owner' | 'Guardian' | 'Emergency Contact';
  createdAt: string;
}

export interface PatientWithOwners extends Patient {
  owners: Array<Owner & {
    isPrimary: boolean;
    relationshipType: string
  }>;
}

export interface OwnerWithPatients extends Owner {
  patients: Array<Patient & {
    isPrimary: boolean;
    relationshipType: string
  }>;
}

export interface DatabaseStats {
  patientCount: number;
  ownerCount: number;
  relationshipCount: number;
}