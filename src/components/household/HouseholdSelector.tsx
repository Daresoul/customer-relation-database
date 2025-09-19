import React, { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { HouseholdSearchInput } from './HouseholdSearchInput';
import { HouseholdSearchResults } from './HouseholdSearchResults';
import { CreateHouseholdForm } from './CreateHouseholdForm';
import { useHouseholdSearchWithSelection } from '../../hooks/useHouseholdSearch';
import { createHouseholdWithPeople } from '../../services/householdService';
import { HouseholdSearchResult, CreateHouseholdWithPeopleDto } from '../../types/household';

interface HouseholdSelectorProps {
  onSelect: (household: HouseholdSearchResult | null) => void;
  selectedHousehold?: HouseholdSearchResult | null;
  showCreateButton?: boolean;
  className?: string;
}

export const HouseholdSelector: React.FC<HouseholdSelectorProps> = ({
  onSelect,
  selectedHousehold: initialSelected,
  showCreateButton = true,
  className = '',
}) => {
  const [mode, setMode] = useState<'search' | 'create' | 'selected'>('search');
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    query,
    setQuery,
    results,
    isLoading,
    selectedHousehold,
    handleSelect,
    clearSelection,
  } = useHouseholdSearchWithSelection('', {
    debounceMs: 300,
    limit: 10,
  });

  // Use initial selected if provided
  React.useEffect(() => {
    if (initialSelected) {
      handleSelect(initialSelected);
      setMode('selected');
    }
  }, [initialSelected, handleSelect]);

  const handleHouseholdSelect = (household: HouseholdSearchResult | null) => {
    if (household) {
      handleSelect(household);
      onSelect(household);
      setMode('selected');
    }
  };

  const handleCreateHousehold = async (dto: CreateHouseholdWithPeopleDto) => {
    console.log('🏠 Starting household creation with data:', dto);
    try {
      setCreateError(null);
      console.log('🏠 Calling createHouseholdWithPeople service...');

      const createdHousehold = await createHouseholdWithPeople(dto);
      console.log('🏠 Household created successfully:', createdHousehold);
      console.log('🏠 Household object keys:', Object.keys(createdHousehold.household));
      console.log('🏠 People array:', createdHousehold.people);
      console.log('🏠 First person keys:', createdHousehold.people[0] ? Object.keys(createdHousehold.people[0]) : 'No people');

      // The service already returns properly transformed camelCase data
      // Convert to search result format using the already transformed data
      const searchResult: HouseholdSearchResult = {
        id: createdHousehold.household.id,
        householdName: createdHousehold.household.householdName,
        address: createdHousehold.household.address,
        people: createdHousehold.people, // This is already in camelCase from the service
        relevanceScore: 1,
        snippet: undefined,
      };

      console.log('🏠 Search result created:');
      console.log('🏠 - ID:', searchResult.id);
      console.log('🏠 - householdName:', searchResult.householdName);
      console.log('🏠 - address:', searchResult.address);
      console.log('🏠 - people[0]:', searchResult.people[0]);
      console.log('🏠 - people[0] firstName:', searchResult.people[0]?.firstName);
      console.log('🏠 - people[0] lastName:', searchResult.people[0]?.lastName);
      console.log('🏠 Selecting household:', searchResult);
      handleHouseholdSelect(searchResult);
      setMode('selected');
      console.log('🏠 Household creation flow completed successfully');
    } catch (error: any) {
      console.error('🏠 ERROR creating household:', error);

      let errorMessage = 'Failed to create household';
      if (error.message) {
        if (error.message.includes('transformation') || error.message.includes('transform')) {
          errorMessage = 'Data processing error. Please try again or contact support.';
        } else if (error.message.includes('validation')) {
          errorMessage = 'Please check all required fields are filled correctly.';
        } else if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }

      setCreateError(errorMessage);
      console.log('🏠 Error set, NOT throwing to prevent redirect');
      // Don't throw the error - this might be causing the redirect
    }
  };

  const handleClearSelection = () => {
    clearSelection();
    onSelect(null);
    setMode('search');
    setQuery('');
  };

  const handleCancelCreate = () => {
    setMode('search');
    setCreateError(null);
  };

  if (mode === 'selected' && selectedHousehold) {

    // Create display name with better fallback logic
    let displayName = '';

    if (selectedHousehold.householdName && selectedHousehold.householdName.trim()) {
      displayName = selectedHousehold.householdName.trim();
    } else if (selectedHousehold.people && selectedHousehold.people.length > 0) {
      const firstPerson = selectedHousehold.people[0];
      if (firstPerson?.firstName && firstPerson?.lastName) {
        const firstName = String(firstPerson.firstName).trim();
        const lastName = String(firstPerson.lastName).trim();
        if (firstName && lastName) {
          displayName = `${firstName} ${lastName}`;
        } else if (firstName) {
          displayName = firstName;
        } else if (lastName) {
          displayName = lastName;
        }
      }
    }

    if (!displayName) {
      displayName = 'Unnamed Household';
    }

    // Find primary contact person with fallback
    const primaryPerson = selectedHousehold.people?.find(person => person?.isPrimary) || selectedHousehold.people?.[0];

    // Get contact info with null checks
    const phoneContacts = primaryPerson?.contacts?.filter(c =>
      c && ['phone', 'mobile', 'work_phone'].includes(c.contactType)
    ) || [];
    const emailContacts = primaryPerson?.contacts?.filter(c =>
      c && c.contactType === 'email'
    ) || [];

    // Get primary phone and email with validation
    const primaryPhone = phoneContacts.find(c => c?.isPrimary) || phoneContacts[0];
    const primaryEmail = emailContacts.find(c => c?.isPrimary) || emailContacts[0];

    return (
      <div className={`${className} selected-household-container`}>
        <div className="selected-household-content">
          <div className="selected-household-info">
            <Check className="selected-household-icon" />
            <div className="selected-household-text">
              <p className="selected-household-label">Selected Household</p>
              <p className="selected-household-name">
                {displayName}
              </p>
              {selectedHousehold.address && (
                <p className="selected-household-address">{selectedHousehold.address}</p>
              )}

              {/* Primary Contact Information */}
              {primaryPerson && (primaryPerson.firstName || primaryPerson.lastName) && (
                <div className="selected-household-contact">
                  <p className="contact-person-name">
                    Primary Contact: {String(primaryPerson.firstName || '').trim()} {String(primaryPerson.lastName || '').trim()}
                  </p>
                  {(primaryPhone || primaryEmail) && (
                    <div className="contact-methods">
                      {primaryPhone && primaryPhone.contactValue && (
                        <p className="contact-info">
                          📞 {primaryPhone.contactValue}
                          {primaryPhone.contactType && primaryPhone.contactType !== 'phone' && (
                            <span className="contact-type"> ({primaryPhone.contactType.replace('_', ' ')})</span>
                          )}
                        </p>
                      )}
                      {primaryEmail && primaryEmail.contactValue && (
                        <p className="contact-info">
                          📧 {primaryEmail.contactValue}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleClearSelection}
            className="selected-household-clear"
          >
            <X className="clear-icon" />
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className={`${className} create-household-container`}>
        <div className="create-household-header">
          <h3>Create New Household</h3>
          <p>Add household members and their contact information</p>
        </div>
        {createError && (
          <div className="form-error">
            <p>{createError}</p>
          </div>
        )}
        <CreateHouseholdForm
          onSubmit={handleCreateHousehold}
          onCancel={handleCancelCreate}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="household-selector-content">
        <div className="household-search-row">
          <div className="household-search-input">
            <HouseholdSearchInput
              onSelect={handleHouseholdSelect}
              placeholder="Search by name, phone, or email..."
              autoFocus
            />
          </div>
          {showCreateButton && (
            <button
              type="button"
              onClick={() => {
                console.log('Create button clicked, switching to create mode');
                setMode('create');
              }}
              className="btn btn-primary create-household-btn"
            >
              <Plus className="h-4 w-4" />
              Create New Household
            </button>
          )}
        </div>

        {query.length >= 2 && (
          <div className="search-results-section">
            <HouseholdSearchResults
              results={results}
              onSelect={handleHouseholdSelect}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
};