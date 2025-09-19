/**
 * Tauri Command Contracts for View Switching Feature
 * Feature: 005-i-want-to
 *
 * These contracts define the IPC interface between React frontend and Rust backend
 */

// ============= View State Commands =============

/**
 * Get the user's current view preference
 * @command get_view_preference
 */
export interface GetViewPreferenceCommand {
  // No input parameters
}

export interface GetViewPreferenceResponse {
  activeView: 'animal' | 'household';
  lastSwitched?: string; // ISO 8601 timestamp
}

/**
 * Set the user's view preference
 * @command set_view_preference
 */
export interface SetViewPreferenceCommand {
  activeView: 'animal' | 'household';
}

export interface SetViewPreferenceResponse {
  success: boolean;
  activeView: 'animal' | 'household';
}

// ============= Household Search Commands =============

/**
 * Search households (reuses search_owners backend)
 * @command search_households
 */
export interface SearchHouseholdsCommand {
  query: string;      // Minimum 2 characters
  limit?: number;     // Default 10, max 100
  offset?: number;    // For pagination, default 0
  sortBy?: 'name' | 'address' | 'created' | 'pet_count';
  sortDirection?: 'asc' | 'desc';
}

export interface HouseholdSearchResult {
  id: number;
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  contacts: Array<{
    type: 'phone' | 'email' | 'mobile' | 'work_phone';
    value: string;
    isPrimary: boolean;
  }>;
  petCount: number;
  relevanceScore?: number;
}

export interface SearchHouseholdsResponse {
  results: HouseholdSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
  offset: number;
  limit: number;
}

// ============= Household Creation Commands =============

/**
 * Create a new household without animals
 * @command create_household
 */
export interface CreateHouseholdCommand {
  firstName?: string;   // At least one name required
  lastName?: string;    // At least one name required
  address?: string;
  city?: string;
  postalCode?: string;
  contacts?: Array<{
    type: 'phone' | 'email' | 'mobile' | 'work_phone';
    value: string;
    isPrimary?: boolean;
  }>;
}

export interface CreateHouseholdResponse {
  id: number;
  householdName: string;
  createdAt: string; // ISO 8601
  success: boolean;
  message?: string;
}

/**
 * Get a single household by ID
 * @command get_household
 */
export interface GetHouseholdCommand {
  id: number;
}

export interface GetHouseholdResponse {
  id: number;
  firstName: string;
  lastName: string;
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  contacts: Array<{
    id: number;
    type: string;
    value: string;
    isPrimary: boolean;
  }>;
  pets: Array<{
    id: number;
    name: string;
    species: string;
    breed?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ============= Animal Search Commands (Existing) =============

/**
 * Search animals/patients
 * @command search_animals
 */
export interface SearchAnimalsCommand {
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    species?: string;
    breed?: string;
    ownerId?: number;
  };
}

export interface AnimalSearchResult {
  id: number;
  name: string;
  species: string;
  breed?: string;
  birthDate?: string;
  ownerId?: number;
  ownerName?: string;
  lastVisit?: string;
}

export interface SearchAnimalsResponse {
  results: AnimalSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
  offset: number;
  limit: number;
}

// ============= Error Types =============

export interface TauriError {
  code: string;
  message: string;
  details?: any;
}

export type CommandResult<T> =
  | { success: true; data: T }
  | { success: false; error: TauriError };

// ============= Type Guards =============

export function isHouseholdView(view: string): view is 'household' {
  return view === 'household';
}

export function isAnimalView(view: string): view is 'animal' {
  return view === 'animal';
}

// ============= Validation Constants =============

export const SEARCH_CONSTRAINTS = {
  MIN_QUERY_LENGTH: 2,
  MAX_QUERY_LENGTH: 100,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

export const HOUSEHOLD_CONSTRAINTS = {
  MAX_NAME_LENGTH: 100,
  MAX_ADDRESS_LENGTH: 200,
  MAX_CITY_LENGTH: 100,
  MAX_POSTAL_CODE_LENGTH: 20,
  MAX_CONTACT_VALUE_LENGTH: 100,
} as const;