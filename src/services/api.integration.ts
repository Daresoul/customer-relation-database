/**
 * T035: API integration layer with Ant Design notifications
 */

import { invoke } from '@/services/invoke';
import { emit } from '@tauri-apps/api/event';
import type { Patient } from '../types';
import type { HouseholdTableRecord } from '../types/ui.types';
import i18n from 'i18next';
import { errorText } from '@/utils/notifyError';
import type { App } from 'antd';
import type { HouseholdWithPeople } from '@/types/generated/HouseholdWithPeople';
import type { HouseholdSearchResult } from '@/types/generated/HouseholdSearchResult';
import type { PersonWithContacts } from '@/types/generated/PersonWithContacts';

type AppApi = ReturnType<typeof App.useApp>;

// Create a holder for the App instance
let appInstance: AppApi | null = null;

export const setAppInstance = (app: AppApi) => {
  appInstance = app;
};

// Error handler with Ant Design notifications
const handleApiError = (error: unknown, operation: string): never => {
  console.error(`API Error in ${operation}:`, error);

  const errorMessage = errorText(error, (key: string) => i18n.t(key));

  // Use App instance if available, otherwise use console.error
  if (appInstance?.notification) {
    appInstance.notification.error({
      message: i18n.t(`common:api.failed.${operation}`),
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
  create: async (patient: Partial<Patient>): Promise<Patient> => {
    const hide = showLoading(i18n.t('common:api.loading.creatingPatient'));
    try {
      const result = await invoke<Patient>('create_patient', { dto: patient });
      hide();
      showSuccess(i18n.t('common:api.success.patientCreated'), i18n.t('common:api.success.patientCreatedDesc', { name: patient.name }));
      try { await emit('patient-created', result); } catch { /* the event is a hint; the patient is saved */ }
      return result;
    } catch (error) {
      hide();
      return handleApiError(error, 'createPatient');
    }
  },

};

const PHONE_TYPES = ['phone', 'mobile', 'work_phone'];

/** Every phone of every person, for the household list search. */
function allPhones(people: PersonWithContacts[] | undefined): string[] {
  return (people ?? []).flatMap((p) =>
    (p.contacts ?? []).filter((c) => PHONE_TYPES.includes(c.contact_type)).map((c) => c.contact_value),
  );
}

// Household API methods
export const householdApi = {
  search: async (query: string, limit?: number): Promise<HouseholdTableRecord[]> => {
    // Empty query: list every household (no limit unless the caller pages).
    // A failure is a page-load error the caller shows inline, so no toast here.
    if (!query || query.trim().length === 0) {
      const results = await invoke<Array<HouseholdWithPeople | HouseholdTableRecord>>('get_all_households', { limit });
      // Transform nested household data to flat structure
      return results.map((r): HouseholdTableRecord => {
        if ('household' in r && r.household) {
          const primaryPerson = r.people?.find((p) => p.is_primary) || r.people?.[0];

          return {
            id: r.household.id,
            lastName: r.household.household_name,
            primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
            phone: primaryPerson?.contacts?.find((c) => c.contact_type === 'phone')?.contact_value || null,
            phones: allPhones(r.people),
            email: primaryPerson?.contacts?.find((c) => c.contact_type === 'email')?.contact_value || null,
            address: r.household.address,
            petCount: r.pet_count || 0,
            lastActivity: r.household.updated_at || r.household.created_at
          };
        }
        return r as HouseholdTableRecord; // Return as-is if not nested
      });
    }

    try {
      // For short queries (1 char), return empty to avoid FTS5 errors
      if (query.trim().length < 2) {
        return [];
      }

      const result = await invoke<{ results?: HouseholdSearchResult[] } | HouseholdTableRecord[]>('search_households', { query, limit });

      // Transform the response similar to get_all_households
      if (!Array.isArray(result) && result?.results && Array.isArray(result.results)) {
        return result.results.map((item) => {
          const primaryPerson = item.people?.find((p) => p.is_primary) || item.people?.[0];

          return {
            id: item.id,
            lastName: item.household_name || i18n.t('common:api.unnamed'),
            primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
            phone: primaryPerson?.contacts?.find((c) => c.contact_type === 'phone')?.contact_value || null,
            email: primaryPerson?.contacts?.find((c) => c.contact_type === 'email')?.contact_value || null,
            address: item.address,
            petCount: item.pet_count || 0,
          };
        });
      }

      // If it's already an array, return as-is
      if (Array.isArray(result)) {
        return result;
      }

      return [];
    } catch (error) {
      return handleApiError(error, 'searchHouseholds');
    }
  },

  create: async (household: Partial<HouseholdTableRecord>): Promise<HouseholdTableRecord> => {
    const hide = showLoading(i18n.t('common:api.loading.creatingHousehold'));
    try {
      // Format address as a single string if it's an object
      let addressString = null;
      if (household.address) {
        if (typeof household.address === 'string') {
          addressString = household.address;
        } else if (typeof household.address === 'object') {
          const addr = household.address as { street?: string; city?: string; state?: string; zipCode?: string };
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

      const result = await invoke<HouseholdWithPeople>('create_household_with_people', { dto });
      hide();
      showSuccess(i18n.t('common:api.success.householdCreated'), i18n.t('common:api.success.householdCreatedDesc', { name: household.lastName }));

      // Transform the nested result to flat HouseholdTableRecord
      if (result.household) {
        const primaryPerson = result.people?.find((p) => p.is_primary) || result.people?.[0];
        const primaryContact = primaryPerson?.contacts?.find((c) => c.is_primary) || primaryPerson?.contacts?.[0];

        return {
          id: result.household.id,
          lastName: result.household.household_name,
          primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
          phone: primaryContact?.contact_type === 'phone' ? primaryContact.contact_value : null,
          email: primaryContact?.contact_type === 'email' ? primaryContact.contact_value : null,
          address: result.household.address,
          petCount: result.pet_count || 0,
          lastActivity: result.household.updated_at || result.household.created_at,
          contacts: result.people?.map((p) => ({
            name: `${p.first_name} ${p.last_name}`,
            firstName: p.first_name,
            lastName: p.last_name,
            phone: p.contacts?.find((c) => c.contact_type === 'phone')?.contact_value,
            email: p.contacts?.find((c) => c.contact_type === 'email')?.contact_value,
            isPrimary: p.is_primary
          })) || []
        };
      }
      return result as unknown as HouseholdTableRecord;
    } catch (error) {
      hide();
      return handleApiError(error, 'createHousehold');
    }
  },

  delete: async (id: number): Promise<void> => {
    const hide = showLoading(i18n.t('common:api.loading.deletingHousehold'));
    try {
      await invoke('delete_household', { householdId: id });
      hide();
      showSuccess(i18n.t('common:api.success.householdDeleted'), i18n.t('common:api.success.householdDeletedDesc'));
    } catch (error) {
      hide();
      return handleApiError(error, 'deleteHousehold');
    }
  },

};

// Export all APIs
export default {
  patient: patientApi,
  household: householdApi,
};
