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
  ownerId?: number;
  householdId?: number;
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

export interface PatientWithHousehold extends Patient {
  household?: {
    id: number;
    householdName: string;
    address?: string;
  };
}

export interface DatabaseStats {
  patientCount: number;
  ownerCount: number;
  relationshipCount: number;
}

// View switching types
export type ViewType = 'animal' | 'household';

export interface ViewPreference {
  activeView: ViewType;
  lastSwitched?: string;
}

export interface SetViewPreferenceCommand {
  activeView: ViewType;
}

export interface SetViewPreferenceResponse {
  success: boolean;
  activeView: ViewType;
}

// Household types
export interface HouseholdContact {
  type: string;
  value: string;
  isPrimary: boolean;
}

export interface HouseholdSearchResult {
  id: number;
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  contacts: HouseholdContact[];
  petCount: number;
  relevanceScore?: number;
}

export interface SearchHouseholdsCommand {
  query: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: string;
}

export interface SearchHouseholdsResponse {
  results: HouseholdSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
  offset: number;
  limit: number;
}

export interface CreateHouseholdCommand {
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  contacts: HouseholdContact[];
}

export interface GetHouseholdResponse {
  id: number;
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  contacts: HouseholdContact[];
  petCount: number;
  createdAt: string;
  updatedAt: string;
}

// Search state types
export interface SearchState {
  query: string;
  results: any[];
  loading: boolean;
  hasQuery: boolean;
}