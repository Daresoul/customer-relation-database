import { invoke } from '@tauri-apps/api/tauri';
import {
  HouseholdWithPeople,
  CreateHouseholdWithPeopleDto,
  CreatePatientWithHouseholdDto,
  CreatePatientWithHouseholdResponse,
  SearchHouseholdsResponse,
  validateHouseholdDto,
} from '../types/household';

// Create a new household with people
export async function createHouseholdWithPeople(
  dto: CreateHouseholdWithPeopleDto
): Promise<HouseholdWithPeople> {
  // Validate before sending
  const error = validateHouseholdDto(dto);
  if (error) {
    throw new Error(error);
  }

  // Transform camelCase to snake_case for Rust backend
  const transformedDto = {
    household: {
      household_name: dto.household.householdName || null,
      address: dto.household.address || null,
      notes: dto.household.notes || null,
    },
    people: dto.people.map(personWithContacts => ({
      person: {
        first_name: personWithContacts.person.firstName || '',
        last_name: personWithContacts.person.lastName || '',
        is_primary: personWithContacts.person.isPrimary || false,
      },
      contacts: personWithContacts.contacts.map(contact => ({
        contact_type: contact.contactType || 'phone',
        contact_value: contact.contactValue || '',
        is_primary: contact.isPrimary || false,
      })),
    })),
  };

  try {
    const backendResult = await invoke<any>('create_household_with_people', { dto: transformedDto });

    // Transform snake_case response back to camelCase for frontend

    const result: HouseholdWithPeople = {
      household: {
        id: backendResult.household?.id || 0,
        householdName: backendResult.household?.household_name || null,
        address: backendResult.household?.address || null,
        notes: backendResult.household?.notes || null,
        createdAt: backendResult.household?.created_at || new Date().toISOString(),
        updatedAt: backendResult.household?.updated_at || new Date().toISOString(),
      },
      people: (backendResult.people || []).map((person: any) => {
        return {
          id: person?.id || 0,
          firstName: person?.first_name || '',
          lastName: person?.last_name || '',
          isPrimary: person?.is_primary || false,
          contacts: (person?.contacts || []).map((contact: any) => {
            return {
              id: contact?.id || 0,
              personId: contact?.person_id || person?.id || 0,
              contactType: contact?.contact_type || 'phone',
              contactValue: contact?.contact_value || '',
              isPrimary: contact?.is_primary || false,
              createdAt: contact?.created_at || new Date().toISOString(),
            };
          }),
        };
      }),
    };

    console.log('🔧 Service: Created household:', result);

    // Validate transformation was successful
    if (!result.household || result.household.id === 0) {
      throw new Error('Failed to transform household data - invalid household');
    }

    if (!result.people || result.people.length === 0) {
      throw new Error('Failed to transform household data - no people found');
    }

    // Check if people have valid names
    const invalidPeople = result.people.filter(person =>
      !person.firstName || !person.lastName ||
      typeof person.firstName !== 'string' ||
      typeof person.lastName !== 'string'
    );

    if (invalidPeople.length > 0) {
      throw new Error('Failed to transform household data - invalid person names after transformation');
    }

    return result;
  } catch (error) {
    console.error('Failed to create household:', error);
    throw error;
  }
}

// Create a patient with a new household
export async function createPatientWithHousehold(
  dto: CreatePatientWithHouseholdDto
): Promise<CreatePatientWithHouseholdResponse> {
  // Validate household part
  const householdDto: CreateHouseholdWithPeopleDto = {
    household: dto.household,
    people: dto.people,
  };
  const error = validateHouseholdDto(householdDto);
  if (error) {
    throw new Error(error);
  }

  try {
    const response = await invoke<any>('create_patient_with_household', { dto });
    return {
      household: response.household,
      patientId: response.patient_id,
    };
  } catch (error) {
    console.error('Failed to create patient with household:', error);
    throw error;
  }
}

// Search households
export async function searchHouseholds(
  query: string,
  limit?: number,
  offset?: number
): Promise<SearchHouseholdsResponse> {
  if (query.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  try {
    const backendResult = await invoke<any>('search_households', {
      query,
      limit: limit || 10,
      offset: offset || 0,
    });

    // Transform snake_case response back to camelCase for frontend
    const result: SearchHouseholdsResponse = {
      results: (backendResult.results || []).map((household: any) => ({
        id: household?.id || 0,
        householdName: household?.household_name || null,
        address: household?.address || null,
        people: (household?.people || []).map((person: any) => ({
          id: person?.id || 0,
          firstName: person?.first_name || '',
          lastName: person?.last_name || '',
          isPrimary: person?.is_primary || false,
          contacts: (person?.contacts || []).map((contact: any) => ({
            id: contact?.id || 0,
            personId: contact?.person_id || person?.id || 0,
            contactType: contact?.contact_type || 'phone',
            contactValue: contact?.contact_value || '',
            isPrimary: contact?.is_primary || false,
            createdAt: contact?.created_at || new Date().toISOString(),
          })),
        })),
        relevanceScore: household?.relevance_score || 0,
        snippet: household?.snippet || undefined,
      })),
      total: backendResult.total || 0,
      hasMore: backendResult.has_more || false,
    };

    return result;
  } catch (error) {
    console.error('Failed to search households:', error);
    throw error;
  }
}

// Quick search for autocomplete
export async function quickSearchHouseholds(
  query: string,
  limit?: number
): Promise<Array<{ id: number; name: string }>> {
  if (query.length < 2) {
    return [];
  }

  try {
    const results = await invoke<Array<[number, string]>>('quick_search_households', {
      query,
      limit: limit || 10,
    });

    return results.map(([id, name]) => ({ id, name }));
  } catch (error) {
    console.error('Failed to quick search households:', error);
    return [];
  }
}

// Get household with all people and contacts
export async function getHouseholdWithPeople(
  householdId: number
): Promise<HouseholdWithPeople | null> {
  try {
    const backendResult = await invoke<any>('get_household_with_people', {
      householdId,
    });

    if (!backendResult) {
      return null;
    }

    // Transform snake_case response back to camelCase for frontend
    const result: HouseholdWithPeople = {
      household: {
        id: backendResult.household?.id || 0,
        householdName: backendResult.household?.household_name || null,
        address: backendResult.household?.address || null,
        notes: backendResult.household?.notes || null,
        createdAt: backendResult.household?.created_at || new Date().toISOString(),
        updatedAt: backendResult.household?.updated_at || new Date().toISOString(),
      },
      people: (backendResult.people || []).map((person: any) => ({
        id: person?.id || 0,
        firstName: person?.first_name || '',
        lastName: person?.last_name || '',
        isPrimary: person?.is_primary || false,
        contacts: (person?.contacts || []).map((contact: any) => ({
          id: contact?.id || 0,
          personId: contact?.person_id || person?.id || 0,
          contactType: contact?.contact_type || 'phone',
          contactValue: contact?.contact_value || '',
          isPrimary: contact?.is_primary || false,
          createdAt: contact?.created_at || new Date().toISOString(),
        })),
      })),
    };

    return result;
  } catch (error) {
    console.error('Failed to get household:', error);
    throw error;
  }
}

// Update household information
export async function updateHousehold(
  householdId: number,
  updates: {
    householdName?: string;
    address?: string;
    notes?: string;
  }
): Promise<void> {
  try {
    await invoke('update_household', {
      householdId,
      householdName: updates.householdName || null,
      address: updates.address || null,
      notes: updates.notes || null,
    });
  } catch (error) {
    console.error('Failed to update household:', error);
    throw error;
  }
}

// Delete household (will cascade delete people and contacts)
export async function deleteHousehold(householdId: number): Promise<void> {
  try {
    await invoke('delete_household', { householdId });
  } catch (error) {
    console.error('Failed to delete household:', error);
    throw error;
  }
}

// Rebuild search index (for maintenance)
export async function rebuildHouseholdSearchIndex(): Promise<void> {
  try {
    await invoke('rebuild_household_search_index');
  } catch (error) {
    console.error('Failed to rebuild search index:', error);
    throw error;
  }
}

// Backward compatibility wrapper class
export class HouseholdService {
  static async searchHouseholdsSimple(query: string): Promise<any[]> {
    const response = await searchHouseholds(query);
    return response.results.map(result => ({
      id: result.id,
      householdName: result.householdName,
      address: result.address,
      contacts: result.people.flatMap(person =>
        person.contacts.map(contact => ({
          type: contact.contactType,
          value: contact.contactValue,
          isPrimary: contact.isPrimary
        }))
      ),
      petCount: 0 // TODO: Implement pet count
    }));
  }

  static async createHousehold(data: any): Promise<any> {
    // Check if it's the new format with people array
    if (data.people && Array.isArray(data.people)) {
      const dto: CreateHouseholdWithPeopleDto = {
        household: {
          householdName: data.householdName,
          address: data.address || undefined,
          notes: undefined
        },
        people: data.people.map((p: any) => ({
          person: {
            firstName: p.firstName || '',
            lastName: p.lastName || '',
            isPrimary: p.isPrimary || false
          },
          contacts: [
            p.email && {
              contactType: 'email',
              contactValue: p.email,
              isPrimary: true
            },
            p.phone && {
              contactType: 'phone',
              contactValue: p.phone,
              isPrimary: !p.email
            },
            p.mobile && {
              contactType: 'mobile',
              contactValue: p.mobile,
              isPrimary: false
            },
            p.workPhone && {
              contactType: 'work',
              contactValue: p.workPhone,
              isPrimary: false
            }
          ].filter(Boolean) as any[]
        }))
      };

      const result = await createHouseholdWithPeople(dto);
      return {
        id: result.household.id,
        householdName: result.household.householdName
      };
    }

    // Old format for backward compatibility
    const dto: CreateHouseholdWithPeopleDto = {
      household: {
        householdName: data.householdName,
        address: data.address || undefined,
        notes: undefined
      },
      people: [{
        person: {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          isPrimary: true
        },
        contacts: []
      }]
    };

    if (data.email) {
      dto.people[0].contacts.push({
        contactType: 'email',
        contactValue: data.email,
        isPrimary: true
      });
    }

    if (data.phone) {
      dto.people[0].contacts.push({
        contactType: 'phone',
        contactValue: data.phone,
        isPrimary: !data.email
      });
    }

    const result = await createHouseholdWithPeople(dto);
    return {
      id: result.household.id,
      householdName: result.household.householdName
    };
  }
}