import { createContext, useContext } from 'react';
import type { ViewType, SearchState, Patient, HouseholdSearchResult } from '../types';

export interface ViewContextType {
  // View state
  currentView: ViewType;
  setCurrentView: (view: ViewType) => Promise<void>;
  isLoading: boolean;

  // Search states (separate for each view)
  animalSearchState: SearchState<Patient>;
  householdSearchState: SearchState<HouseholdSearchResult>;

  // Actions
  switchToAnimalView: () => Promise<void>;
  switchToHouseholdView: () => Promise<void>;
  switchToAppointmentsView: () => Promise<void>;
  updateAnimalSearch: (query: string, results: Patient[], loading: boolean) => void;
  updateHouseholdSearch: (query: string, results: HouseholdSearchResult[], loading: boolean) => void;
  clearAnimalSearch: () => void;
  clearHouseholdSearch: () => void;
}

export const ViewContext = createContext<ViewContextType | undefined>(undefined);

export const useViewContext = (): ViewContextType => {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error('useViewContext must be used within a ViewProvider');
  }
  return context;
};
