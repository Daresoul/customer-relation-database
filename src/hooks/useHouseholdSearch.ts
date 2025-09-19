import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { searchHouseholds, quickSearchHouseholds } from '../services/householdService';
import { HouseholdSearchResult } from '../types/household';

interface UseHouseholdSearchOptions {
  debounceMs?: number;
  limit?: number;
  minQueryLength?: number;
  enabled?: boolean;
}

// Main search hook with debouncing and caching
export function useHouseholdSearch(
  initialQuery: string = '',
  options: UseHouseholdSearchOptions = {}
) {
  const {
    debounceMs = 300,
    limit = 10,
    minQueryLength = 2,
    enabled = true
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [offset, setOffset] = useState(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce the query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0); // Reset offset when query changes
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceMs]);

  // Use React Query for caching and state management
  const searchQuery = useQuery({
    queryKey: ['household-search', debouncedQuery, limit, offset],
    queryFn: () => searchHouseholds(debouncedQuery, limit, offset),
    enabled: enabled && debouncedQuery.length >= minQueryLength,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData,
  });

  const loadMore = useCallback(() => {
    if (!searchQuery.data?.hasMore) return;
    setOffset((prev) => prev + limit);
  }, [searchQuery.data?.hasMore, limit]);

  const reset = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setOffset(0);
  }, []);

  return {
    query,
    setQuery,
    results: searchQuery.data?.results || [],
    total: searchQuery.data?.total || 0,
    hasMore: searchQuery.data?.hasMore || false,
    isLoading: searchQuery.isLoading,
    isError: searchQuery.isError,
    error: searchQuery.error,
    loadMore,
    reset,
    offset,
  };
}

// Quick search hook for autocomplete
export function useQuickHouseholdSearch(
  initialQuery: string = '',
  options: UseHouseholdSearchOptions = {}
) {
  const {
    debounceMs = 200,
    limit = 10,
    minQueryLength = 2,
    enabled = true
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce the query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceMs]);

  // Use React Query for quick search
  const searchQuery = useQuery({
    queryKey: ['household-quick-search', debouncedQuery, limit],
    queryFn: () => quickSearchHouseholds(debouncedQuery, limit),
    enabled: enabled && debouncedQuery.length >= minQueryLength,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    query,
    setQuery,
    suggestions: searchQuery.data || [],
    isLoading: searchQuery.isLoading,
    isError: searchQuery.isError,
    error: searchQuery.error,
  };
}

// Hook for managing selected household
export function useSelectedHousehold() {
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdSearchResult | null>(null);
  const queryClient = useQueryClient();

  const selectHousehold = useCallback((household: HouseholdSearchResult | null) => {
    setSelectedHousehold(household);

    // Optionally prefetch full household details
    if (household) {
      queryClient.prefetchQuery({
        queryKey: ['household', household.id],
        queryFn: () => import('../services/householdService').then(m =>
          m.getHouseholdWithPeople(household.id)
        ),
      });
    }
  }, [queryClient]);

  const clearSelection = useCallback(() => {
    setSelectedHousehold(null);
  }, []);

  return {
    selectedHousehold,
    selectHousehold,
    clearSelection,
  };
}

// Combined hook for search with selection
export function useHouseholdSearchWithSelection(
  initialQuery: string = '',
  options: UseHouseholdSearchOptions = {}
) {
  const search = useHouseholdSearch(initialQuery, options);
  const selection = useSelectedHousehold();

  const handleSelect = useCallback((household: HouseholdSearchResult) => {
    selection.selectHousehold(household);
    search.reset(); // Clear search after selection
  }, [selection, search]);

  return {
    ...search,
    selectedHousehold: selection.selectedHousehold,
    handleSelect,
    clearSelection: selection.clearSelection,
  };
}