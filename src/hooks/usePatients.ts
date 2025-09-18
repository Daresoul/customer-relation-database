/**
 * Patient data management hook
 */

import { useState, useCallback, useEffect } from 'react';
import { PatientWithOwners, CreatePatientInput, UpdatePatientInput, AsyncState } from '../types';
import { PatientService } from '../services';

export function usePatients() {
  const [state, setState] = useState<AsyncState<PatientWithOwners[]>>({
    data: null,
    loading: false,
    error: null
  });

  // Get all patients
  const getPatients = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const patients = await PatientService.getPatients();
      setState({
        data: patients,
        loading: false,
        error: null,
        lastFetch: Date.now()
      });
      return patients;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to load patients';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  // Get single patient
  const getPatient = useCallback(async (id: number): Promise<PatientWithOwners> => {
    try {
      return await PatientService.getPatient(id);
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Create patient
  const createPatient = useCallback(async (input: CreatePatientInput): Promise<PatientWithOwners> => {
    try {
      const newPatient = await PatientService.createPatient(input);

      // Update local state
      setState(prev => ({
        ...prev,
        data: prev.data ? [newPatient, ...prev.data] : [newPatient]
      }));

      return newPatient;
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Update patient
  const updatePatient = useCallback(async (id: number, updates: UpdatePatientInput) => {
    try {
      const updatedPatient = await PatientService.updatePatient(id, updates);

      // Refresh patient list to get updated data with owners
      await getPatients();

      return updatedPatient;
    } catch (error: any) {
      throw error;
    }
  }, [getPatients]);

  // Delete patient
  const deletePatient = useCallback(async (id: number) => {
    try {
      await PatientService.deletePatient(id);

      // Update local state
      setState(prev => ({
        ...prev,
        data: prev.data ? prev.data.filter(patient => patient.id !== id) : null
      }));
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Add owner to patient
  const addPatientOwner = useCallback(async (
    patientId: number,
    ownerId: number,
    isPrimary?: boolean,
    relationshipType?: 'Owner' | 'Guardian' | 'Emergency Contact'
  ) => {
    try {
      await PatientService.addPatientOwner(patientId, ownerId, isPrimary, relationshipType);
      // Refresh to get updated relationships
      await getPatients();
    } catch (error: any) {
      throw error;
    }
  }, [getPatients]);

  // Remove owner from patient
  const removePatientOwner = useCallback(async (patientId: number, ownerId: number) => {
    try {
      await PatientService.removePatientOwner(patientId, ownerId);
      // Refresh to get updated relationships
      await getPatients();
    } catch (error: any) {
      throw error;
    }
  }, [getPatients]);

  // Set primary owner
  const setPrimaryOwner = useCallback(async (patientId: number, ownerId: number) => {
    try {
      await PatientService.setPrimaryOwner(patientId, ownerId);
      // Refresh to get updated relationships
      await getPatients();
    } catch (error: any) {
      throw error;
    }
  }, [getPatients]);

  // Refresh patients data
  const refreshPatients = useCallback(() => {
    return getPatients();
  }, [getPatients]);

  // Auto-fetch on mount
  useEffect(() => {
    getPatients();
  }, [getPatients]);

  return {
    patients: state.data || [],
    loading: state.loading,
    error: state.error,
    lastFetch: state.lastFetch,
    getPatients,
    getPatient,
    createPatient,
    updatePatient,
    deletePatient,
    addPatientOwner,
    removePatientOwner,
    setPrimaryOwner,
    refreshPatients
  };
}

export default usePatients;