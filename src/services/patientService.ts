/**
 * Patient-related API service functions
 */

import { ApiService } from './api';
import {
  Patient,
  CreatePatientInput,
  UpdatePatientInput
} from '../types';

// Backend response type (snake_case)
interface PatientResponse {
  id: number;
  name: string;
  species: string;
  breed?: string | null;
  date_of_birth?: string | null;
  color?: string | null;
  gender?: string | null;
  weight?: number | null;
  microchip_id?: string | null;
  medical_notes?: string | null;
  is_active: boolean;
  household_id?: number | null;
  created_at: string;
  updated_at: string;
}

export class PatientService {
  /**
   * Transform backend response to match frontend Patient type
   * Note: Some fields don't exist in the current database schema
   */
  private static transformResponse(response: any): Patient {
    // Handle null values explicitly - don't convert null to undefined for dateOfBirth
    const dateOfBirth = response.dateOfBirth !== undefined ? response.dateOfBirth :
                        response.date_of_birth !== undefined ? response.date_of_birth :
                        undefined;

    return {
      id: response.id,
      name: response.name,
      species: response.species,
      breed: response.breed || undefined,
      dateOfBirth: dateOfBirth,
      color: response.color || undefined, // Not in database yet
      gender: response.gender || undefined, // Not in database yet
      weight: response.weight || undefined,
      microchipId: response.microchipId || response.microchip_id || undefined, // Not in database yet
      notes: response.medicalNotes || response.medical_notes || undefined,
      isActive: response.isActive ?? response.is_active ?? true, // Not in database yet
      householdId: response.householdId || response.household_id || undefined,
      createdAt: response.createdAt || response.created_at,
      updatedAt: response.updatedAt || response.updated_at
    };
  }
  /**
   * Get all patients
   */
  static async getPatients(): Promise<Patient[]> {
    return ApiService.invoke<Patient[]>('get_patients');
  }

  /**
   * Get a single patient by ID
   */
  static async getPatient(id: number): Promise<Patient> {
    const response = await ApiService.invoke<any>('get_patient', { id });

    if (!response) {
      throw new Error('Patient not found');
    }

    // Always transform to ensure all fields are properly handled
    return this.transformResponse(response);
  }

  /**
   * Create a new patient
   */
  static async createPatient(input: CreatePatientInput): Promise<Patient> {
    // Backend expects camelCase with ID fields
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

    // Create the patient
    const patient = await ApiService.invoke<Patient>('create_patient', { dto });
    console.log('🎯 PatientService: Created patient:', patient);

    return patient;
  }


  /**
   * Update an existing patient
   */
  static async updatePatient(id: number, updates: UpdatePatientInput): Promise<Patient> {
    console.log('🎯 PatientService.updatePatient called with:', { id, updates });

    // Backend has #[serde(rename_all = "camelCase")] so it expects camelCase!
    // Only include fields that are actually being updated (not undefined)
    const dto: any = {};

    if (updates.name !== undefined) dto.name = updates.name;
    if (updates.speciesId !== undefined) dto.speciesId = updates.speciesId;
    if (updates.breedId !== undefined) dto.breedId = updates.breedId || null;
    if (updates.gender !== undefined) dto.gender = updates.gender || null;
    if (updates.dateOfBirth !== undefined) {
      // Backend expects dateOfBirth in camelCase, not date_of_birth!
      dto.dateOfBirth = updates.dateOfBirth || null;
    }
    if (updates.weight !== undefined) dto.weight = updates.weight || null;
    if (updates.notes !== undefined) dto.medicalNotes = updates.notes || null;
    if (updates.color !== undefined) dto.color = updates.color || null;
    if (updates.microchipId !== undefined) dto.microchipId = updates.microchipId || null;
    if (updates.isActive !== undefined) dto.isActive = updates.isActive;

    console.log('🎯 PatientService: Sending DTO to backend:', dto);

    const response = await ApiService.invoke<any>('update_patient', { id, dto });

    // Always transform to ensure all fields are properly handled
    const patient = this.transformResponse(response);
    console.log('🎯 PatientService: Updated patient:', patient);
    return patient;
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
}

export default PatientService;