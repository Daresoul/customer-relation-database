/**
 * Search state management hook
 */

import { useState, useCallback, useEffect } from 'react';
import { PatientWithOwners, SearchParams, AsyncState } from '../types';
import { SearchService } from '../services';
import { useDebounce } from './useDebounce';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AsyncState<PatientWithOwners[]>>({
    data: null,
    loading: false,
    error: null
  });

  const debouncedQuery = useDebounce(query, 300);

  // Search patients
  const searchPatients = useCallback(async (searchParams: SearchParams) => {
    if (!searchParams.query || searchParams.query.trim().length < 2) {
      setResults({
        data: [],
        loading: false,
        error: null
      });
      return [];
    }

    setResults(prev => ({ ...prev, loading: true, error: null }));

    try {
      const searchResults = await SearchService.searchPatients(searchParams);
      setResults({
        data: searchResults,
        loading: false,
        error: null,
        lastFetch: Date.now()
      });
      return searchResults;
    } catch (error: any) {
      const errorMessage = error?.message || 'Search failed';
      setResults(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  // Get search suggestions
  const getSuggestions = useCallback(async (searchQuery: string): Promise<string[]> => {
    try {
      return await SearchService.getSearchSuggestions(searchQuery);
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery('');
    setResults({
      data: null,
      loading: false,
      error: null
    });
  }, []);

  // Update search query
  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  // Clear search cache
  const clearCache = useCallback(() => {
    SearchService.clearSearchCache();
  }, []);

  // Auto-search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      searchPatients({ query: debouncedQuery });
    } else if (debouncedQuery.trim().length === 0) {
      setResults({
        data: null,
        loading: false,
        error: null
      });
    }
  }, [debouncedQuery, searchPatients]);

  return {
    query,
    debouncedQuery,
    results: results.data || [],
    loading: results.loading,
    error: results.error,
    lastFetch: results.lastFetch,
    hasQuery: query.trim().length > 0,
    hasResults: (results.data?.length || 0) > 0,
    updateQuery,
    searchPatients,
    getSuggestions,
    clearSearch,
    clearCache
  };
}

export default useSearch;