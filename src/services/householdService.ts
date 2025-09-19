/**
 * Service for managing household operations
 */

import { ApiService } from './api';
import {
  SearchHouseholdsCommand,
  SearchHouseholdsResponse,
  CreateHouseholdCommand,
  GetHouseholdResponse,
  HouseholdSearchResult,
} from '../types';

export class HouseholdService {
  /**
   * Search households with pagination and sorting
   */
  static async searchHouseholds(
    query: string,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortDirection?: string;
    } = {}
  ): Promise<SearchHouseholdsResponse> {
    if (query.length < 2) {
      throw ApiService.createError('Query must be at least 2 characters', 'INVALID_QUERY');
    }

    const command: SearchHouseholdsCommand = {
      query,
      limit: options.limit,
      offset: options.offset,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
    };

    return ApiService.invoke<SearchHouseholdsResponse>('search_households', command);
  }

  /**
   * Search households with simple query (for compatibility)
   */
  static async searchHouseholdsSimple(query: string): Promise<HouseholdSearchResult[]> {
    const response = await this.searchHouseholds(query);
    return response.results;
  }

  /**
   * Create a new household
   */
  static async createHousehold(command: CreateHouseholdCommand): Promise<GetHouseholdResponse> {
    // Validation
    if (!command.householdName.trim()) {
      throw ApiService.createError('Household name is required', 'VALIDATION_ERROR');
    }

    if (command.contacts.length === 0) {
      throw ApiService.createError('At least one contact is required', 'VALIDATION_ERROR');
    }

    // Validate contact information
    for (const contact of command.contacts) {
      if (!contact.value.trim()) {
        throw ApiService.createError('Contact value cannot be empty', 'VALIDATION_ERROR');
      }

      if (contact.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contact.value)) {
          throw ApiService.createError('Invalid email format', 'VALIDATION_ERROR');
        }
      }
    }

    return ApiService.invoke<GetHouseholdResponse>('create_household', command);
  }

  /**
   * Get household by ID
   */
  static async getHousehold(id: number): Promise<GetHouseholdResponse | null> {
    return ApiService.invoke<GetHouseholdResponse | null>('get_household', { id });
  }

  /**
   * Search households with advanced filtering
   */
  static async searchWithFilters(
    query: string,
    filters: {
      minPetCount?: number;
      maxPetCount?: number;
      city?: string;
      postalCode?: string;
      contactType?: string;
    } = {}
  ): Promise<SearchHouseholdsResponse> {
    // For now, we'll do basic search and filter on the client side
    // In a production system, these filters would be sent to the backend
    const response = await this.searchHouseholds(query);

    let filteredResults = response.results;

    if (filters.minPetCount !== undefined) {
      filteredResults = filteredResults.filter(h => h.petCount >= filters.minPetCount!);
    }

    if (filters.maxPetCount !== undefined) {
      filteredResults = filteredResults.filter(h => h.petCount <= filters.maxPetCount!);
    }

    if (filters.city) {
      filteredResults = filteredResults.filter(h =>
        h.city?.toLowerCase().includes(filters.city!.toLowerCase())
      );
    }

    if (filters.postalCode) {
      filteredResults = filteredResults.filter(h =>
        h.postalCode?.includes(filters.postalCode!)
      );
    }

    if (filters.contactType) {
      filteredResults = filteredResults.filter(h =>
        h.contacts.some(c => c.type === filters.contactType)
      );
    }

    return {
      ...response,
      results: filteredResults,
      total: filteredResults.length,
      hasMore: false,
    };
  }

  /**
   * Get household statistics
   */
  static async getHouseholdStats(): Promise<{
    totalHouseholds: number;
    averagePetsPerHousehold: number;
    householdsWithMultiplePets: number;
  }> {
    try {
      // Since we don't have a dedicated stats endpoint, we'll search for all households
      // In a production system, this would be a separate endpoint
      const response = await this.searchHouseholds('', { limit: 1000 });

      const totalHouseholds = response.results.length;
      const totalPets = response.results.reduce((sum, h) => sum + h.petCount, 0);
      const averagePetsPerHousehold = totalHouseholds > 0 ? totalPets / totalHouseholds : 0;
      const householdsWithMultiplePets = response.results.filter(h => h.petCount > 1).length;

      return {
        totalHouseholds,
        averagePetsPerHousehold: Math.round(averagePetsPerHousehold * 100) / 100,
        householdsWithMultiplePets,
      };
    } catch (error) {
      console.warn('Failed to get household stats:', error);
      return {
        totalHouseholds: 0,
        averagePetsPerHousehold: 0,
        householdsWithMultiplePets: 0,
      };
    }
  }
}

export default HouseholdService;