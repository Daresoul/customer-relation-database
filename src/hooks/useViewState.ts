/**
 * useViewState - Hook for managing view state with localStorage persistence
 */

import { useViewContext } from '../contexts/ViewContext';
import { ViewType, SearchState, PatientWithOwners, HouseholdSearchResult } from '../types';

export interface UseViewStateReturn {
  // Current view state
  currentView: ViewType;
  isLoading: boolean;

  // View switching
  switchToAnimalView: () => Promise<void>;
  switchToHouseholdView: () => Promise<void>;
  setCurrentView: (view: ViewType) => Promise<void>;

  // Search states
  animalSearchState: SearchState;
  householdSearchState: SearchState;
  currentSearchState: SearchState;

  // Search actions
  updateAnimalSearch: (query: string, results: PatientWithOwners[], loading: boolean) => void;
  updateHouseholdSearch: (query: string, results: HouseholdSearchResult[], loading: boolean) => void;
  clearAnimalSearch: () => void;
  clearHouseholdSearch: () => void;
  clearCurrentSearch: () => void;

  // Convenience computed properties
  isAnimalView: boolean;
  isHouseholdView: boolean;
  hasCurrentQuery: boolean;
  isCurrentSearchLoading: boolean;
}

/**
 * Custom hook that provides view state management with localStorage persistence
 */
export const useViewState = (): UseViewStateReturn => {
  const {
    currentView,
    setCurrentView,
    isLoading,
    animalSearchState,
    householdSearchState,
    switchToAnimalView,
    switchToHouseholdView,
    updateAnimalSearch,
    updateHouseholdSearch,
    clearAnimalSearch,
    clearHouseholdSearch,
  } = useViewContext();

  // Get current search state based on active view
  const currentSearchState = currentView === 'animal' ? animalSearchState : householdSearchState;

  // Clear search for current view
  const clearCurrentSearch = () => {
    if (currentView === 'animal') {
      clearAnimalSearch();
    } else {
      clearHouseholdSearch();
    }
  };

  // Convenience computed properties
  const isAnimalView = currentView === 'animal';
  const isHouseholdView = currentView === 'household';
  const hasCurrentQuery = currentSearchState.hasQuery;
  const isCurrentSearchLoading = currentSearchState.loading;

  return {
    // View state
    currentView,
    isLoading,

    // View switching
    switchToAnimalView,
    switchToHouseholdView,
    setCurrentView,

    // Search states
    animalSearchState,
    householdSearchState,
    currentSearchState,

    // Search actions
    updateAnimalSearch,
    updateHouseholdSearch,
    clearAnimalSearch,
    clearHouseholdSearch,
    clearCurrentSearch,

    // Convenience properties
    isAnimalView,
    isHouseholdView,
    hasCurrentQuery,
    isCurrentSearchLoading,
  };
};

export default useViewState;