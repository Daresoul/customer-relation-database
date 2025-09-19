/**
 * ViewToggle - Component for switching between Animal and Household views
 */

import React, { memo } from 'react';
import { ViewType } from '../types';
import { LoadingSpinner } from './LoadingSpinner';

interface ViewToggleProps {
  currentView: ViewType;
  isLoading: boolean;
  onViewChange: (view: ViewType) => Promise<void>;
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = memo(({
  currentView,
  isLoading,
  onViewChange,
  className = '',
}) => {
  const handleAnimalClick = async () => {
    if (currentView !== 'animal' && !isLoading) {
      await onViewChange('animal');
    }
  };

  const handleHouseholdClick = async () => {
    if (currentView !== 'household' && !isLoading) {
      await onViewChange('household');
    }
  };

  return (
    <div className={`view-toggle ${className}`}>
      <div className="view-toggle-buttons">
        <button
          onClick={handleAnimalClick}
          disabled={isLoading}
          className={`view-toggle-btn ${
            currentView === 'animal' ? 'active' : ''
          } ${isLoading ? 'loading' : ''}`}
          title="Switch to Animal View"
        >
          {isLoading && currentView === 'animal' ? (
            <LoadingSpinner size="small" />
          ) : (
            <>
              <svg
                className="view-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4.5 12a.5.5 0 01.5-.5h14a.5.5 0 010 1H5a.5.5 0 01-.5-.5zM3 8a.5.5 0 01.5-.5h17a.5.5 0 010 1h-17A.5.5 0 013 8zm2 8a.5.5 0 01.5-.5h13a.5.5 0 010 1h-13a.5.5 0 01-.5-.5z"/>
              </svg>
              Animals
            </>
          )}
        </button>

        <button
          onClick={handleHouseholdClick}
          disabled={isLoading}
          className={`view-toggle-btn ${
            currentView === 'household' ? 'active' : ''
          } ${isLoading ? 'loading' : ''}`}
          title="Switch to Household View"
        >
          {isLoading && currentView === 'household' ? (
            <LoadingSpinner size="small" />
          ) : (
            <>
              <svg
                className="view-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
              Households
            </>
          )}
        </button>
      </div>

      <div className="view-description">
        {currentView === 'animal' ? (
          <span>Search and manage individual animals</span>
        ) : (
          <span>Search and manage household information</span>
        )}
      </div>
    </div>
  );
});

ViewToggle.displayName = 'ViewToggle';

export default ViewToggle;