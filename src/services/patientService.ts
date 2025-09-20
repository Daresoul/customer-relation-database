/**
 * Patient-related API service functions
 */

import { ApiService } from './api';
import {
  Patient,
  CreatePatientInput,
  UpdatePatientInput
} from '../types';

export class PatientService {
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
    return ApiService.invoke<Patient>('get_patient', { id });
  }

  /**
   * Create a new patient
   */
  static async createPatient(input: CreatePatientInput): Promise<Patient> {
    // Transform camelCase frontend data to snake_case backend format
    const dto = {
      name: input.name,
      species: input.species,
      breed: input.breed || null,
      gender: input.gender || null,
      date_of_birth: input.dateOfBirth || null,
      weight: input.weight || null,
      medical_notes: input.notes || null,
      household_id: input.householdId || null
    };

    console.log('🎯 PatientService: Creating patient with transformed data:', dto);

    // Create the patient
    const patient = await ApiService.invoke<Patient>('create_patient', { dto });
    console.log('🎯 PatientService: Created patient:', patient);

    return patient;
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
      gender: updates.gender || null,
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
  static async searchPatients(query: string, limit?: number): Promise<Patient[]> {
    return ApiService.invoke<Patient[]>('search_patients', {
      query,
      limit: limit || 100
    });
  }
}

export default PatientService;