/**
 * Search functionality service - Dual-mode for Animals and Households
 */

import { ApiService } from './api';
import { Patient, SearchParams, ViewType, HouseholdSearchResult } from '../types';
import { HouseholdService } from './householdService';

export class SearchService {
  /**
   * Search patients with debouncing support
   */
  static async searchPatients(params: SearchParams): Promise<Patient[]> {
    if (!params.query || params.query.trim().length < 2) {
      return [];
    }

    return ApiService.invoke<Patient[]>('search_patients', {
      query: params.query.trim(),
      limit: params.limit || 50
    });
  }

  /**
   * Get search suggestions based on partial input
   */
  static async getSearchSuggestions(query: string): Promise<string[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      // Get search results and extract unique suggestions
      const results = await this.searchPatients({ query, limit: 10 });
      const suggestions = new Set<string>();

      results.forEach(patient => {
        // Add patient name suggestions
        if (patient.name.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(patient.name);
        }

        // Add species suggestions
        if (patient.species.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(patient.species);
        }

        // Add breed suggestions
        if (patient.breed && patient.breed.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(patient.breed);
        }
      });

      return Array.from(suggestions).slice(0, 5);
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Search households with debouncing support
   */
  static async searchHouseholds(params: SearchParams): Promise<HouseholdSearchResult[]> {
    if (!params.query || params.query.trim().length < 2) {
      return [];
    }

    return HouseholdService.searchHouseholdsSimple(params.query.trim());
  }

  /**
   * Unified search that works with both view modes
   */
  static async search(
    query: string,
    mode: ViewType,
    options: { limit?: number } = {}
  ): Promise<Patient[] | HouseholdSearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    if (mode === 'animal') {
      return this.searchPatients({ query, limit: options.limit });
    } else {
      return this.searchHouseholds({ query, limit: options.limit });
    }
  }

  /**
   * Get search suggestions for the current mode
   */
  static async getSuggestionsForMode(query: string, mode: ViewType): Promise<string[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      if (mode === 'animal') {
        return this.getSearchSuggestions(query);
      } else {
        return this.getHouseholdSuggestions(query);
      }
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Get household search suggestions
   */
  static async getHouseholdSuggestions(query: string): Promise<string[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const results = await this.searchHouseholds({ query, limit: 10 });
      const suggestions = new Set<string>();

      results.forEach(household => {
        // Add household name suggestions
        if (household.householdName.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(household.householdName);
        }

        // Add city suggestions
        if (household.city && household.city.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(household.city);
        }

        // Add contact value suggestions (phone/email)
        household.contacts.forEach(contact => {
          if (contact.value.toLowerCase().includes(query.toLowerCase())) {
            suggestions.add(contact.value);
          }
        });
      });

      return Array.from(suggestions).slice(0, 5);
    } catch (error) {
      console.error('Failed to get household suggestions:', error);
      return [];
    }
  }

  /**
   * Clear search cache if needed
   */
  static clearSearchCache(): void {
    // Implementation would depend on if we add caching later
  }
}

export default SearchService;