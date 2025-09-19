/**
 * SearchView - Dual-mode search component for Animals and Households
 */

import React from 'react';
import { ViewType, PatientWithOwners, HouseholdSearchResult, SearchState } from '../types';
import { SearchBar } from './SearchBar';
import { PatientList } from './PatientList';
import { HouseholdList } from './HouseholdList';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

interface SearchViewProps {
  mode: ViewType;
  searchState: SearchState;
  allItems: PatientWithOwners[] | HouseholdSearchResult[];
  loading: boolean;
  error?: string | null;
  onSearch: (query: string) => void;
  onClear: () => void;
  onItemClick?: (item: PatientWithOwners | HouseholdSearchResult) => void;
  onEditItem?: (item: PatientWithOwners | HouseholdSearchResult) => void;
  onDeleteItem?: (item: PatientWithOwners | HouseholdSearchResult) => void;
  onCreateItem?: () => void;
  className?: string;
}

export const SearchView: React.FC<SearchViewProps> = ({
  mode,
  searchState,
  allItems,
  loading,
  error,
  onSearch,
  onClear,
  onItemClick,
  onEditItem,
  onDeleteItem,
  onCreateItem,
  className = '',
}) => {
  // Determine which items to display based on search state
  const displayItems = searchState.hasQuery ? searchState.results : allItems;
  const isLoading = searchState.hasQuery ? searchState.loading : loading;

  // Debug logging
  console.log('SearchView Debug:', {
    mode,
    hasQuery: searchState.hasQuery,
    searchResults: searchState.results,
    allItems,
    displayItems,
    loading,
    isLoading
  });

  // Get the appropriate placeholder and labels based on mode
  const getPlaceholderText = () => {
    return mode === 'animal'
      ? 'Search animals by name, species, breed, or owner...'
      : 'Search households by name, address, phone, or email...';
  };

  const getEmptyStateProps = () => {
    if (searchState.hasQuery) {
      if (mode === 'animal') {
        return {
          title: 'No animals found',
          description: `No animals match your search "${searchState.query}".`,
          actionLabel: 'Create New Animal',
          onAction: onCreateItem,
        };
      } else {
        return {
          title: 'No households found',
          description: `No households match your search "${searchState.query}".`,
        };
      }
    }

    if (mode === 'animal') {
      return {
        title: 'No animals yet',
        description: 'Get started by adding your first animal.',
        actionLabel: 'Add First Animal',
        onAction: onCreateItem,
      };
    } else {
      return {
        title: 'No households yet',
        description: 'There are no households in the system yet.',
      };
    }
  };

  const getResultCountText = () => {
    const itemType = mode === 'animal' ? 'animal' : 'household';
    const count = displayItems.length;

    if (searchState.hasQuery) {
      return `Found ${count} ${itemType}${count !== 1 ? 's' : ''} for "${searchState.query}"`;
    }

    return `${count} ${itemType}${count !== 1 ? 's' : ''} total`;
  };

  const emptyStateProps = getEmptyStateProps();

  return (
    <div className={`search-view search-view--${mode} ${className}`}>
      {/* Search Bar */}
      <div className="search-section">
        <SearchBar
          placeholder={getPlaceholderText()}
          onSearch={onSearch}
          onClear={onClear}
          initialValue={searchState.query}
          className="search-view__bar"
        />

        {/* Search Info */}
        {(searchState.hasQuery || displayItems.length > 0) && (
          <div className="search-info">
            <p className="search-results-count">
              {isLoading ? (
                `Searching ${mode === 'animal' ? 'animals' : 'households'}...`
              ) : (
                getResultCountText()
              )}
            </p>

            {searchState.hasQuery && !isLoading && displayItems.length > 0 && (
              <button
                onClick={onClear}
                className="btn btn-sm btn-secondary"
              >
                Show All {mode === 'animal' ? 'Animals' : 'Households'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="search-content">
        {error && !searchState.hasQuery && (
          <div className="error-message">
            <h3>Error Loading {mode === 'animal' ? 'Animals' : 'Households'}</h3>
            <p>{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="loading-container">
            <LoadingSpinner />
            <p>Loading {mode === 'animal' ? 'animals' : 'households'}...</p>
          </div>
        ) : displayItems.length === 0 ? (
          <EmptyState
            title={emptyStateProps.title}
            message={emptyStateProps.description}
            actionLabel={emptyStateProps.actionLabel}
            onAction={emptyStateProps.onAction}
          />
        ) : (
          <div className="items-list">
            {mode === 'animal' ? (
              <PatientList
                patients={displayItems as PatientWithOwners[]}
                loading={false}
                error={null}
                onEditPatient={onEditItem ? (patient: PatientWithOwners) => {
                  onEditItem(patient);
                } : undefined}
                onDeletePatient={onDeleteItem ? (patient: PatientWithOwners) => {
                  onDeleteItem(patient);
                } : undefined}
                onCreatePatient={onCreateItem}
                onPatientClick={onItemClick ? (patient: PatientWithOwners) => {
                  onItemClick(patient);
                } : undefined}
              />
            ) : (
              <HouseholdList
                households={displayItems as HouseholdSearchResult[]}
                loading={false}
                error={null}
                onEditHousehold={onEditItem ? (household: HouseholdSearchResult) => {
                  onEditItem(household);
                } : undefined}
                onDeleteHousehold={onDeleteItem ? (household: HouseholdSearchResult) => {
                  onDeleteItem(household);
                } : undefined}
                onCreateHousehold={onCreateItem}
                onHouseholdClick={onItemClick ? (household: HouseholdSearchResult) => {
                  onItemClick(household);
                } : undefined}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchView;