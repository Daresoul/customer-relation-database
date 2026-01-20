/**
 * Household Service
 * Uses ApiService for automatic case transformation between frontend (camelCase) and backend (snake_case)
 */

import { ApiService } from './api';
import {
  HouseholdWithPeople,
  CreateHouseholdWithPeopleDto,
  CreatePatientWithHouseholdDto,
  CreatePatientWithHouseholdResponse,
  SearchHouseholdsResponse,
  validateHouseholdDto,
} from '../types/household';

export class HouseholdService {
  /**
   * Create a new household with people
   */
  static async createHouseholdWithPeople(
    dto: CreateHouseholdWithPeopleDto
  ): Promise<HouseholdWithPeople> {
    // Validate before sending
    const error = validateHouseholdDto(dto);
    if (error) {
      throw new Error(error);
    }

    const result = await ApiService.invoke<HouseholdWithPeople>('create_household_with_people', { dto });

    // Validate transformation was successful
    if (!result.household || result.household.id === 0) {
      throw new Error('Failed to create household - invalid response');
    }

    if (!result.people || result.people.length === 0) {
      throw new Error('Failed to create household - no people found');
    }

    return result;
  }

  /**
   * Create a patient with a new household
   */
  static async createPatientWithHousehold(
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

    return ApiService.invoke<CreatePatientWithHouseholdResponse>('create_patient_with_household', { dto });
  }

  /**
   * Search households
   */
  static async searchHouseholds(
    query: string,
    limit?: number,
    offset?: number
  ): Promise<SearchHouseholdsResponse> {
    if (query.length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    return ApiService.invoke<SearchHouseholdsResponse>('search_households', {
      query,
      limit: limit || 10,
      offset: offset || 0,
    });
  }

  /**
   * Quick search for autocomplete
   */
  static async quickSearchHouseholds(
    query: string,
    limit?: number
  ): Promise<Array<{ id: number; name: string }>> {
    if (query.length < 2) {
      return [];
    }

    const results = await ApiService.invoke<Array<[number, string]>>('quick_search_households', {
      query,
      limit: limit || 10,
    });

    return results.map(([id, name]) => ({ id, name }));
  }

  /**
   * Get household with all people and contacts
   */
  static async getHouseholdWithPeople(
    householdId: number
  ): Promise<HouseholdWithPeople | null> {
    const result = await ApiService.invoke<HouseholdWithPeople | null>('get_household_with_people', {
      householdId,
    });

    return result;
  }

  /**
   * Update household information
   */
  static async updateHousehold(
    householdId: number,
    updates: {
      householdName?: string;
      address?: string;
      notes?: string;
    }
  ): Promise<void> {
    await ApiService.invoke('update_household', {
      householdId,
      householdName: updates.householdName || null,
      address: updates.address || null,
      notes: updates.notes || null,
    });
  }

  /**
   * Delete household (will cascade delete people and contacts)
   */
  static async deleteHousehold(householdId: number): Promise<void> {
    await ApiService.invoke('delete_household', { householdId });
  }

  /**
   * Rebuild search index (for maintenance)
   */
  static async rebuildHouseholdSearchIndex(): Promise<void> {
    await ApiService.invoke('rebuild_household_search_index');
  }

  /**
   * Search households (simple format for backward compatibility)
   */
  static async searchHouseholdsSimple(query: string): Promise<any[]> {
    const response = await this.searchHouseholds(query);
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

  /**
   * Create household (backward compatibility wrapper)
   */
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

      const result = await this.createHouseholdWithPeople(dto);
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

    const result = await this.createHouseholdWithPeople(dto);
    return {
      id: result.household.id,
      householdName: result.household.householdName
    };
  }
}

// Export standalone functions for backward compatibility
export const createHouseholdWithPeople = HouseholdService.createHouseholdWithPeople.bind(HouseholdService);
export const createPatientWithHousehold = HouseholdService.createPatientWithHousehold.bind(HouseholdService);
export const searchHouseholds = HouseholdService.searchHouseholds.bind(HouseholdService);
export const quickSearchHouseholds = HouseholdService.quickSearchHouseholds.bind(HouseholdService);
export const getHouseholdWithPeople = HouseholdService.getHouseholdWithPeople.bind(HouseholdService);
export const updateHousehold = HouseholdService.updateHousehold.bind(HouseholdService);
export const deleteHousehold = HouseholdService.deleteHousehold.bind(HouseholdService);
export const rebuildHouseholdSearchIndex = HouseholdService.rebuildHouseholdSearchIndex.bind(HouseholdService);
