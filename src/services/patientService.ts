/**
 * Patient-related API service functions
 * Uses ApiService for automatic camelCase ↔ snake_case transformation
 */

import { ApiService } from './api';
import { emit } from '@tauri-apps/api/event';
import {
  Patient,
  PatientWithOwners,
  CreatePatientInput,
  UpdatePatientInput
} from '../types';

export class PatientService {
  /**
   * Get all patients
   */
  static async getPatients(): Promise<PatientWithOwners[]> {
    return ApiService.invoke<PatientWithOwners[]>('get_patients');
  }

  /**
   * Get a single patient by ID
   */
  static async getPatient(id: number): Promise<PatientWithOwners> {
    const response = await ApiService.invoke<PatientWithOwners | null>('get_patient', { id });

    if (!response) {
      throw new Error('Patient not found');
    }

    return response;
  }

  /**
   * Create a new patient
   */
  static async createPatient(input: CreatePatientInput): Promise<PatientWithOwners> {
    const dto = {
      name: input.name,
      speciesId: input.speciesId,
      breedId: input.breedId || null,
      gender: input.gender || null,
      dateOfBirth: input.dateOfBirth || null,
      weight: input.weight || null,
      medicalNotes: input.notes || null,
      householdId: input.householdId || null
    };

    // Use raw invoke to preserve camelCase DTO expected by backend
    // Include color and microchipId in DTO now that backend supports them
    if (input.color !== undefined) (dto as any).color = input.color || null;
    if (input.microchipId !== undefined) (dto as any).microchipId = input.microchipId || null;

    const created = await ApiService.invokeRaw<PatientWithOwners>('create_patient', { dto });
    try { await emit('patient-created', created as any); } catch {}
    return created;
  }

  /**
   * Update an existing patient
   */
  static async updatePatient(id: number, updates: UpdatePatientInput): Promise<PatientWithOwners> {
    // Only include fields that are actually being updated (not undefined)
    const dto: Record<string, unknown> = {};

    if (updates.name !== undefined) dto.name = updates.name;
    if (updates.speciesId !== undefined) dto.speciesId = updates.speciesId;
    if (updates.breedId !== undefined) dto.breedId = updates.breedId || null;
    if (updates.gender !== undefined) dto.gender = updates.gender || null;
    if (updates.dateOfBirth !== undefined) dto.dateOfBirth = updates.dateOfBirth || null;
    if (updates.weight !== undefined) dto.weight = updates.weight || null;
    if (updates.notes !== undefined) dto.medicalNotes = updates.notes || null;
    if (updates.color !== undefined) dto.color = updates.color || null;
    if (updates.microchipId !== undefined) dto.microchipId = updates.microchipId || null;
    if (updates.isActive !== undefined) dto.isActive = updates.isActive;

    // Use raw invoke to preserve camelCase DTO expected by backend
    return ApiService.invokeRaw<PatientWithOwners>('update_patient', { id, dto });
  }

  /**
   * Delete a patient
   */
  static async deletePatient(id: number): Promise<void> {
    return ApiService.invoke<void>('delete_patient', { id });
  }

  /**
   * Search patients by query
   */
  static async searchPatients(query: string, limit?: number): Promise<Patient[]> {
    return ApiService.invoke<Patient[]>('search_patients', {
      query,
      limit: limit || 100
    });
  }

  /**
   * Update a patient's household assignment
   */
  static async updatePatientHousehold(patientId: number, householdId: number | null): Promise<void> {
    return ApiService.invoke<void>('update_patient_household', {
      patientId,
      householdId
    });
  }

  /**
   * Link a patient to a household
   */
  static async linkPatientToHousehold(
    patientId: number,
    householdId: number,
    relationshipType?: string,
    isPrimary?: boolean
  ): Promise<void> {
    return ApiService.invoke<void>('link_patient_to_household', {
      patientId,
      householdId,
      relationshipType,
      isPrimary
    });
  }

  /**
   * Unlink a patient from a household
   */
  static async unlinkPatientFromHousehold(patientId: number, householdId: number): Promise<void> {
    return ApiService.invoke<void>('unlink_patient_from_household', {
      patientId,
      householdId
    });
  }

  /**
   * Add an owner to a patient
   */
  static async addPatientOwner(
    patientId: number,
    ownerId: number,
    isPrimary?: boolean,
    relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact'
  ): Promise<void> {
    return ApiService.invoke<void>('add_patient_owner', {
      patientId,
      ownerId,
      isPrimary,
      relationshipType
    });
  }

  /**
   * Remove an owner from a patient
   */
  static async removePatientOwner(patientId: number, ownerId: number): Promise<void> {
    return ApiService.invoke<void>('remove_patient_owner', {
      patientId,
      ownerId
    });
  }

  /**
   * Set primary owner for a patient
   */
  static async setPrimaryOwner(patientId: number, ownerId: number): Promise<void> {
    return ApiService.invoke<void>('set_primary_owner', {
      patientId,
      ownerId
    });
  }
}

export default PatientService;
