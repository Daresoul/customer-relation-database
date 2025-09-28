/**
 * T035: API integration layer with Ant Design notifications
 */

import { invoke } from '@tauri-apps/api/tauri';
import { App } from 'antd';
import type { Patient } from '../types';
import type { HouseholdTableRecord } from '../types/ui.types';

// Create a holder for the App instance
let appInstance: any = null;

export const setAppInstance = (app: any) => {
  appInstance = app;
};

// Error handler with Ant Design notifications
const handleApiError = (error: any, operation: string) => {
  console.error(`API Error in ${operation}:`, error);

  const errorMessage = error?.message || error?.toString() || 'An unexpected error occurred';

  // Use App instance if available, otherwise use console.error
  if (appInstance?.notification) {
    appInstance.notification.error({
      message: `${operation} Failed`,
      description: errorMessage,
      placement: 'bottomRight',
      duration: 6,
    });
  } else {
    console.error(`${operation} Failed:`, errorMessage);
  }

  throw error;
};

// Success notification helper
const showSuccess = (msg: string, description?: string) => {
  if (appInstance?.notification) {
    appInstance.notification.success({
      message: msg,
      description: description || undefined,
      placement: 'bottomRight',
      duration: 4,
    });
  }
};

// Loading message helper
const showLoading = (text: string) => {
  if (appInstance?.message) {
    return appInstance.message.loading(text, 0);
  } else {
    return () => {}; // Return a no-op function
  }
};

// Patient API methods
export const patientApi = {
  search: async (query: string, limit?: number): Promise<Patient[]> => {
    try {
      return await invoke<Patient[]>('search_patients', { query: query || '', limit });
    } catch (error) {
      return handleApiError(error, 'Search Patients');
    }
  },

  create: async (patient: Partial<Patient>): Promise<Patient> => {
    const hide = showLoading('Creating patient...');
    try {
      const result = await invoke<Patient>('create_patient', { dto: patient });
      hide();
      showSuccess('Patient Created', `${patient.name} has been successfully added`);
      return result;
    } catch (error) {
      hide();
      return handleApiError(error, 'Create Patient');
    }
  },

  update: async (id: number, updates: Partial<Patient>): Promise<Patient> => {
    const hide = showLoading('Updating patient...');
    try {
      const result = await invoke<Patient>('update_patient', { id, dto: updates });
      hide();
      showSuccess('Patient Updated', 'Changes have been saved');
      return result;
    } catch (error) {
      hide();
      return handleApiError(error, 'Update Patient');
    }
  },

  delete: async (id: number): Promise<void> => {
    const hide = showLoading('Deleting patient...');
    try {
      await invoke('delete_patient', { id });
      hide();
      showSuccess('Patient Deleted', 'The patient has been removed');
    } catch (error) {
      hide();
      return handleApiError(error, 'Delete Patient');
    }
  },

  get: async (id: number): Promise<Patient> => {
    try {
      return await invoke<Patient>('get_patient', { id });
    } catch (error) {
      return handleApiError(error, 'Get Patient');
    }
  },

  list: async (ownerId?: number): Promise<Patient[]> => {
    try {
      return await invoke<Patient[]>('list_patients', { ownerId });
    } catch (error) {
      return handleApiError(error, 'List Patients');
    }
  },
};

// Household API methods
export const householdApi = {
  search: async (query: string, limit?: number): Promise<HouseholdTableRecord[]> => {
    try {
      // If query is completely empty, use get_all_households to fetch everything
      if (!query || query.trim().length === 0) {
        try {
          const results = await invoke<any[]>('get_all_households', { limit: limit || 1000 });
          // Transform nested household data to flat structure
          return results.map(r => {
            if (r.household) {
              const primaryPerson = r.people?.find((p: any) => p.is_primary) || r.people?.[0];
              const primaryContact = primaryPerson?.contacts?.find((c: any) => c.is_primary) || primaryPerson?.contacts?.[0];

              return {
                id: r.household.id,
                lastName: r.household.household_name || r.household.name,
                primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
                phone: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'phone')?.contact_value || null,
                email: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'email')?.contact_value || null,
                address: r.household.address,
                petCount: r.pet_count || 0,
                lastActivity: r.household.updated_at || r.household.created_at,
                status: 'active'
              };
            }
            return r; // Return as-is if not nested
          });
        } catch {
          // If get_all_households doesn't exist, return empty
          return [];
        }
      }

      // For short queries (1 char), return empty to avoid FTS5 errors
      if (query.trim().length < 2) {
        return [];
      }

      const result = await invoke<any>('search_households', { query, limit });

      // Transform the response similar to get_all_households
      if (result?.results && Array.isArray(result.results)) {
        return result.results.map((item: any) => {
          const household = item.household || {};
          const primaryPerson = item.people?.find((p: any) => p.is_primary) || item.people?.[0];

          return {
            id: household.id,
            lastName: household.household_name || household.name || household.last_name || 'Unnamed',
            primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
            phone: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'phone')?.contact_value || null,
            email: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'email')?.contact_value || null,
            address: household.address,
            petCount: item.pet_count || 0,
            lastActivity: household.updated_at || household.created_at,
            status: 'active'
          };
        });
      }

      // If it's already an array, return as-is
      if (Array.isArray(result)) {
        return result;
      }

      return [];
    } catch (error) {
      return handleApiError(error, 'Search Households');
    }
  },

  create: async (household: Partial<HouseholdTableRecord>): Promise<HouseholdTableRecord> => {
    const hide = showLoading('Creating household...');
    try {
      // Format address as a single string if it's an object
      let addressString = null;
      if (household.address) {
        if (typeof household.address === 'string') {
          addressString = household.address;
        } else if (typeof household.address === 'object') {
          const addr = household.address as any;
          const parts = [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean);
          addressString = parts.length > 0 ? parts.join(', ') : null;
        }
      }

      // Transform to backend DTO format
      const dto = {
        household: {
          household_name: household.lastName || null,
          address: addressString,
          notes: household.notes || null,
        },
        people: household.contacts?.map((c, index) => ({
          person: {
            first_name: c.firstName || '',
            last_name: c.lastName || household.lastName || '',
            is_primary: index === 0 ? true : (c.isPrimary || false)
          },
          contacts: [
            ...(c.phone ? [{
              contact_type: 'phone',
              contact_value: c.phone,
              is_primary: true
            }] : []),
            ...(c.email ? [{
              contact_type: 'email',
              contact_value: c.email,
              is_primary: !c.phone
            }] : [])
          ]
        })) || []
      };

      const result = await invoke<any>('create_household_with_people', { dto });
      hide();
      showSuccess('Household Created', `${household.lastName} household has been created`);

      // Transform the nested result to flat HouseholdTableRecord
      if (result.household) {
        const primaryPerson = result.people?.find((p: any) => p.is_primary) || result.people?.[0];
        const primaryContact = primaryPerson?.contacts?.find((c: any) => c.is_primary) || primaryPerson?.contacts?.[0];

        return {
          id: result.household.id,
          lastName: result.household.household_name || result.household.name,
          primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
          phone: primaryContact?.contact_type === 'phone' ? primaryContact.contact_value : null,
          email: primaryContact?.contact_type === 'email' ? primaryContact.contact_value : null,
          address: result.household.address,
          petCount: result.pet_count || 0,
          lastActivity: result.household.updated_at || result.household.created_at,
          status: 'active',
          contacts: result.people?.map((p: any) => ({
            firstName: p.first_name,
            lastName: p.last_name,
            phone: p.contacts?.find((c: any) => c.contact_type === 'phone')?.contact_value,
            email: p.contacts?.find((c: any) => c.contact_type === 'email')?.contact_value,
            isPrimary: p.is_primary
          })) || []
        };
      }
      return result;
    } catch (error) {
      hide();
      return handleApiError(error, 'Create Household');
    }
  },

  update: async (id: number, updates: Partial<HouseholdTableRecord>): Promise<HouseholdTableRecord> => {
    const hide = showLoading('Updating household...');
    try {
      const result = await invoke<HouseholdTableRecord>('update_household', { id, updates });
      hide();
      showSuccess('Household Updated', 'Changes have been saved');
      return result;
    } catch (error) {
      hide();
      return handleApiError(error, 'Update Household');
    }
  },

  delete: async (id: number): Promise<void> => {
    const hide = showLoading('Deleting household...');
    try {
      await invoke('delete_household', { id });
      hide();
      showSuccess('Household Deleted', 'The household has been removed');
    } catch (error) {
      hide();
      return handleApiError(error, 'Delete Household');
    }
  },

  get: async (id: number): Promise<HouseholdTableRecord> => {
    try {
      return await invoke<HouseholdTableRecord>('get_household', { id });
    } catch (error) {
      return handleApiError(error, 'Get Household');
    }
  },

  list: async (): Promise<HouseholdTableRecord[]> => {
    try {
      return await invoke<HouseholdTableRecord[]>('list_households');
    } catch (error) {
      return handleApiError(error, 'List Households');
    }
  },

  addPatient: async (householdId: number, patientId: number): Promise<void> => {
    const hide = showLoading('Adding patient to household...');
    try {
      await invoke('add_patient_to_household', { householdId, patientId });
      hide();
      showSuccess('Patient Added', 'Patient has been added to the household');
    } catch (error) {
      hide();
      return handleApiError(error, 'Add Patient to Household');
    }
  },

  removePatient: async (householdId: number, patientId: number): Promise<void> => {
    const hide = showLoading('Removing patient from household...');
    try {
      await invoke('remove_patient_from_household', { householdId, patientId });
      hide();
      showSuccess('Patient Removed', 'Patient has been removed from the household');
    } catch (error) {
      hide();
      return handleApiError(error, 'Remove Patient from Household');
    }
  },
};

// View preference API
export const viewApi = {
  getPreference: async (): Promise<string> => {
    try {
      return await invoke<string>('get_view_preference');
    } catch (error) {
      console.error('Failed to get view preference:', error);
      return 'patients'; // Default fallback
    }
  },

  setPreference: async (view: string): Promise<void> => {
    try {
      await invoke('set_view_preference', { activeView: view });
    } catch (error) {
      console.error('Failed to set view preference:', error);
    }
  },
};

// Batch operations with progress
export const batchOperations = {
  importPatients: async (patients: Partial<Patient>[], onProgress?: (current: number, total: number) => void): Promise<Patient[]> => {
    const results: Patient[] = [];
    const total = patients.length;
    
    for (let i = 0; i < patients.length; i++) {
      try {
        const patient = await patientApi.create(patients[i]);
        results.push(patient);
        onProgress?.(i + 1, total);
      } catch (error) {
        console.error(`Failed to import patient ${i + 1}:`, error);
      }
    }
    
    showSuccess('Import Complete', `Successfully imported ${results.length} of ${total} patients`);
    return results;
  },

  deleteMultiplePatients: async (ids: number[]): Promise<void> => {
    const hide = showLoading(`Deleting ${ids.length} patients...`);
    let successCount = 0;
    
    for (const id of ids) {
      try {
        await invoke('delete_patient', { id });
        successCount++;
      } catch (error) {
        console.error(`Failed to delete patient ${id}:`, error);
      }
    }
    
    hide();
    
    if (successCount === ids.length) {
      showSuccess('Patients Deleted', `Successfully deleted ${successCount} patients`);
    } else {
      if (appInstance?.notification) {
        appInstance.notification.warning({
          message: 'Partial Success',
          description: `Deleted ${successCount} of ${ids.length} patients`,
          placement: 'topRight',
        });
      } else {
        console.warn('Partial Success:', `Deleted ${successCount} of ${ids.length} patients`);
      }
    }
  },
};

// Export all APIs
export default {
  patient: patientApi,
  household: householdApi,
  view: viewApi,
  batch: batchOperations,
};