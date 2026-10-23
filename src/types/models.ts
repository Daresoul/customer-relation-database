/**
 * Core data models for the veterinary clinic management system
 */

export interface Patient {
  id: number;
  name?: string;
  species?: string;
  breed?: string;
  dateOfBirth?: string;
  color?: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  weight?: number;
  microchipId?: string;
  notes?: string;
  /** Standing medical notes (`patients.medical_notes`); saved through `notes`. */
  medicalNotes?: string | null;
  isActive: boolean;
  householdId?: number;
  createdAt: string;
  updatedAt: string;
  /** null: not recorded */
  neutered?: boolean | null;
  deceasedAt?: string | null;
  deceasedNote?: string | null;
  inactiveReason?: string | null;
  /** Date of the newest weight-log entry, the one `weight` holds. */
  lastWeightAt?: string | null;
  alerts?: PatientAlert[];
}

export type { PatientAlert } from './generated/PatientAlert';
export type { PatientWeight } from './generated/PatientWeight';
import type { PatientAlert } from './generated/PatientAlert';

export interface PatientWithHousehold extends Patient {
  household?: {
    id: number;
    householdName: string;
    address?: string;
  };
}

export interface DatabaseStats {
  patientCount: number;
  householdCount: number;
  peopleCount: number;
}

// View switching types
export type ViewType = 'animal' | 'household' | 'appointments';

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