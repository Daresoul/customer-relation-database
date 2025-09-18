/**
 * Tauri Command Contracts
 *
 * These TypeScript interfaces define the contract between the React frontend
 * and Rust backend via Tauri's IPC mechanism.
 */

import { Patient, Owner, PatientWithOwners, OwnerWithPatients, CreatePatientInput, CreateOwnerInput } from '../../../src/types/models';

/**
 * Tauri Command Definitions
 * These map to #[tauri::command] functions in Rust
 */

// Patient Commands
export interface PatientCommands {
  /**
   * Get all patients with their owners
   * @returns List of patients with associated owner information
   */
  get_patients(): Promise<PatientWithOwners[]>;

  /**
   * Get a single patient by ID with owners
   * @param id Patient ID
   * @returns Patient with owner information or error
   */
  get_patient(id: number): Promise<PatientWithOwners>;

  /**
   * Create a new patient with initial owner
   * @param input Patient creation data including initial owner ID
   * @returns Created patient with owner information
   */
  create_patient(input: CreatePatientInput): Promise<PatientWithOwners>;

  /**
   * Update an existing patient
   * @param id Patient ID
   * @param updates Partial patient data to update
   * @returns Updated patient
   */
  update_patient(id: number, updates: Partial<Patient>): Promise<Patient>;

  /**
   * Delete a patient
   * @param id Patient ID
   * @returns Success confirmation
   */
  delete_patient(id: number): Promise<void>;

  /**
   * Search patients and owners
   * @param query Search string
   * @param limit Maximum results (default 100)
   * @returns Matching patients with owner information
   */
  search_patients(query: string, limit?: number): Promise<PatientWithOwners[]>;
}

// Owner Commands
export interface OwnerCommands {
  /**
   * Get all owners
   * @returns List of all owners
   */
  get_owners(): Promise<Owner[]>;

  /**
   * Get owner with their patients
   * @param id Owner ID
   * @returns Owner with associated patients
   */
  get_owner_with_patients(id: number): Promise<OwnerWithPatients>;

  /**
   * Create a new owner
   * @param input Owner creation data
   * @returns Created owner
   */
  create_owner(input: CreateOwnerInput): Promise<Owner>;

  /**
   * Update an existing owner
   * @param id Owner ID
   * @param updates Partial owner data to update
   * @returns Updated owner
   */
  update_owner(id: number, updates: Partial<Owner>): Promise<Owner>;

  /**
   * Check if owner can be deleted
   * @param id Owner ID
   * @returns True if owner has no patients
   */
  can_delete_owner(id: number): Promise<boolean>;

  /**
   * Delete an owner (only if no patients)
   * @param id Owner ID
   * @returns Success confirmation
   */
  delete_owner(id: number): Promise<void>;
}

// Relationship Commands
export interface RelationshipCommands {
  /**
   * Associate an owner with a patient
   * @param patientId Patient ID
   * @param ownerId Owner ID
   * @param isPrimary Whether this is the primary owner
   * @param relationshipType Type of relationship
   */
  add_patient_owner(
    patientId: number,
    ownerId: number,
    isPrimary?: boolean,
    relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact'
  ): Promise<void>;

  /**
   * Remove owner-patient association
   * @param patientId Patient ID
   * @param ownerId Owner ID
   */
  remove_patient_owner(patientId: number, ownerId: number): Promise<void>;

  /**
   * Update primary owner for a patient
   * @param patientId Patient ID
   * @param ownerId New primary owner ID
   */
  set_primary_owner(patientId: number, ownerId: number): Promise<void>;
}

// Database Commands
export interface DatabaseCommands {
  /**
   * Initialize database with schema
   * @returns Success confirmation
   */
  init_database(): Promise<void>;

  /**
   * Get database statistics
   * @returns Count of patients and owners
   */
  get_database_stats(): Promise<{
    patientCount: number;
    ownerCount: number;
    relationshipCount: number;
  }>;

  /**
   * Backup database to file
   * @param path Optional backup path
   * @returns Backup file path
   */
  backup_database(path?: string): Promise<string>;
}

/**
 * Error Response Format
 */
export interface TauriError {
  message: string;
  code?: string;
  details?: any;
}

/**
 * Paginated Response Format
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Command Response Types
 */
export type CommandResponse<T> = Promise<T | TauriError>;

/**
 * Complete Tauri Commands Interface
 * This combines all command groups
 */
export interface TauriCommands
  extends PatientCommands,
    OwnerCommands,
    RelationshipCommands,
    DatabaseCommands {}

/**
 * Type-safe invoke wrapper
 * Use this in the frontend to ensure type safety
 */
export async function invokeCommand<K extends keyof TauriCommands>(
  cmd: K,
  args?: Parameters<TauriCommands[K]>[0]
): Promise<ReturnType<TauriCommands[K]>> {
  // This will be implemented in the actual service layer
  // using @tauri-apps/api/tauri invoke
  throw new Error('Implement in services/api.ts');
}