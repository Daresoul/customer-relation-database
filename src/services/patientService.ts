/**
 * Patient-related API service functions
 */

import { ApiService } from './api';
import {
  Patient,
  PatientWithOwners,
  CreatePatientInput,
  UpdatePatientInput
} from '../types';

export class PatientService {
  /**
   * Get all patients with their owners
   */
  static async getPatients(): Promise<PatientWithOwners[]> {
    return ApiService.invoke<PatientWithOwners[]>('get_patients');
  }

  /**
   * Get a single patient by ID with owners
   */
  static async getPatient(id: number): Promise<PatientWithOwners> {
    return ApiService.invoke<PatientWithOwners>('get_patient', { id });
  }

  /**
   * Create a new patient
   */
  static async createPatient(input: CreatePatientInput): Promise<PatientWithOwners> {
    // Transform camelCase frontend data to snake_case backend format
    const dto = {
      name: input.name,
      species: input.species,
      breed: input.breed || null,
      date_of_birth: input.dateOfBirth || null,
      weight: input.weight || null,
      medical_notes: input.notes || null,
    };

    console.log('🎯 PatientService: Creating patient with transformed data:', dto);
    return ApiService.invoke<PatientWithOwners>('create_patient', { dto });
  }


  /**
   * Update an existing patient
   */
  static async updatePatient(id: number, updates: UpdatePatientInput): Promise<Patient> {
    // Transform camelCase frontend data to snake_case backend format
    const dto = {
      name: updates.name,
      species: updates.species,
      breed: updates.breed || null,
      date_of_birth: updates.dateOfBirth || null,
      weight: updates.weight || null,
      medical_notes: updates.notes || null,
      is_active: updates.isActive
    };

    console.log('🎯 PatientService: Updating patient with transformed data:', dto);
    return ApiService.invoke<Patient>('update_patient', { id, dto });
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
  static async searchPatients(query: string, limit?: number): Promise<PatientWithOwners[]> {
    return ApiService.invoke<PatientWithOwners[]>('search_patients', {
      query,
      limit: limit || 100
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
      isPrimary: isPrimary || false,
      relationshipType: relationshipType || 'Owner'
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