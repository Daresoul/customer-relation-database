/**
 * Search functionality service
 */

import { ApiService } from './api';
import { PatientWithOwners, SearchParams } from '../types';

export class SearchService {
  /**
   * Search patients and owners with debouncing support
   */
  static async searchPatients(params: SearchParams): Promise<PatientWithOwners[]> {
    if (!params.query || params.query.trim().length < 2) {
      return [];
    }

    return ApiService.invoke<PatientWithOwners[]>('search_patients', {
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

        // Add owner name suggestions
        patient.owners.forEach(owner => {
          const fullName = `${owner.firstName} ${owner.lastName}`;
          if (fullName.toLowerCase().includes(query.toLowerCase())) {
            suggestions.add(fullName);
          }
        });
      });

      return Array.from(suggestions).slice(0, 5);
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Clear search cache if needed
   */
  static clearSearchCache(): void {
    // Implementation would depend on if we add caching later
    console.log('Search cache cleared');
  }
}

export default SearchService;