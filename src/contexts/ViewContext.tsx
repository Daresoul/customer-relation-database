/**
 * ViewContext - Manages the global view state (animal vs household)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { ViewType, ViewPreference, SearchState, PatientWithOwners, HouseholdSearchResult } from '../types';
import { invoke } from '@tauri-apps/api';

interface ViewContextType {
  // View state
  currentView: ViewType;
  setCurrentView: (view: ViewType) => Promise<void>;
  isLoading: boolean;

  // Search states (separate for each view)
  animalSearchState: SearchState;
  householdSearchState: SearchState;

  // Actions
  switchToAnimalView: () => Promise<void>;
  switchToHouseholdView: () => Promise<void>;
  updateAnimalSearch: (query: string, results: PatientWithOwners[], loading: boolean) => void;
  updateHouseholdSearch: (query: string, results: HouseholdSearchResult[], loading: boolean) => void;
  clearAnimalSearch: () => void;
  clearHouseholdSearch: () => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

interface ViewProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'vetClinic_viewPreference';

export const ViewProvider: React.FC<ViewProviderProps> = ({ children }) => {
  const [currentView, setCurrentViewState] = useState<ViewType>('animal');
  const [isLoading, setIsLoading] = useState(true);

  // Separate search states for each view
  const [animalSearchState, setAnimalSearchState] = useState<SearchState>({
    query: '',
    results: [],
    loading: false,
    hasQuery: false,
  });

  const [householdSearchState, setHouseholdSearchState] = useState<SearchState>({
    query: '',
    results: [],
    loading: false,
    hasQuery: false,
  });

  // Load initial view preference - always default to animal (patients) view
  useEffect(() => {
    const loadViewPreference = async () => {
      try {
        // Always start with animal view (patients)
        setCurrentViewState('animal');

        // Clear any stored preference to ensure patients is default
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeView: 'animal' }));

        // Update backend to match
        try {
          await invoke('set_view_preference', { activeView: 'animal' });
        } catch (e) {
          // Ignore backend errors on initialization
        }
      } catch (error) {
        console.warn('Failed to initialize view preference:', error);
        setCurrentViewState('animal');
      } finally {
        setIsLoading(false);
      }
    };

    loadViewPreference();
  }, []);

  const setCurrentView = useCallback(async (view: ViewType) => {
    try {
      setIsLoading(true);

      // Update UI immediately
      setCurrentViewState(view);

      // Update localStorage immediately for fast response
      const preference: ViewPreference = { activeView: view, lastSwitched: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));

      // Sync with backend
      await invoke('set_view_preference', { activeView: view });
    } catch (error) {
      console.error('Failed to set view preference:', error);
      // Revert on error
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preference = JSON.parse(stored) as ViewPreference;
        setCurrentViewState(preference.activeView);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchToAnimalView = useCallback(async () => {
    await setCurrentView('animal');
  }, [setCurrentView]);

  const switchToHouseholdView = useCallback(async () => {
    await setCurrentView('household');
  }, [setCurrentView]);

  const updateAnimalSearch = useCallback((query: string, results: PatientWithOwners[], loading: boolean) => {
    setAnimalSearchState({
      query,
      results,
      loading,
      hasQuery: query.trim().length > 0,
    });
  }, []);

  const updateHouseholdSearch = useCallback((query: string, results: HouseholdSearchResult[], loading: boolean) => {
    setHouseholdSearchState({
      query,
      results,
      loading,
      hasQuery: query.trim().length > 0,
    });
  }, []);

  const clearAnimalSearch = useCallback(() => {
    setAnimalSearchState({
      query: '',
      results: [],
      loading: false,
      hasQuery: false,
    });
  }, []);

  const clearHouseholdSearch = useCallback(() => {
    setHouseholdSearchState({
      query: '',
      results: [],
      loading: false,
      hasQuery: false,
    });
  }, []);

  const value: ViewContextType = {
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
  };

  return (
    <ViewContext.Provider value={value}>
      {children}
    </ViewContext.Provider>
  );
};

export const useViewContext = (): ViewContextType => {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error('useViewContext must be used within a ViewProvider');
  }
  return context;
};