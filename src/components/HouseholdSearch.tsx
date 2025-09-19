/**
 * Household search component with inline creation
 * Supports searching for households and creating new ones with multiple people
 */

import React, { useState, useEffect, useCallback } from 'react';
import { HouseholdSearchResult } from '../types';
import { HouseholdService } from '../services';
import { useDebounce } from '../hooks';
import LoadingSpinner from './LoadingSpinner';

interface Person {
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  contacts: {
    email?: string;
    phone?: string;
    mobile?: string;
    workPhone?: string;
  };
}

interface HouseholdSearchProps {
  value?: number; // Selected household ID
  onChange: (householdId: number | null) => void;
  onCreateHousehold?: (household: any) => Promise<void>;
  onCancel?: () => void; // Cancel callback for standalone form
  placeholder?: string;
  required?: boolean;
  className?: string;
  startInCreateMode?: boolean; // Start with creation form open
}

export const HouseholdSearch: React.FC<HouseholdSearchProps> = ({
  value,
  onChange,
  onCreateHousehold,
  onCancel,
  placeholder = 'Search households by name, email, phone...',
  required = false,
  className = '',
  startInCreateMode = false
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HouseholdSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdSearchResult | null>(null);

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(startInCreateMode);
  const [isCreating, setIsCreating] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [householdAddress, setHouseholdAddress] = useState('');
  const [people, setPeople] = useState<Person[]>([
    {
      firstName: '',
      lastName: '',
      isPrimary: true,
      contacts: { email: '', phone: '', mobile: '', workPhone: '' }
    }
  ]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Load selected household if value is provided
  useEffect(() => {
    if (value && !selectedHousehold) {
      // TODO: Load household by ID
      console.log('Load household:', value);
    }
  }, [value, selectedHousehold]);

  // Perform search when query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await HouseholdService.searchHouseholdsSimple(debouncedSearchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Household search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchQuery]);

  // Handle household selection
  const handleSelectHousehold = (household: HouseholdSearchResult) => {
    setSelectedHousehold(household);
    onChange(household.id);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle removing selection
  const handleClearSelection = () => {
    setSelectedHousehold(null);
    onChange(null);
  };

  // Handle adding a new person to the household
  const handleAddPerson = () => {
    if (people.length >= 5) {
      alert('Maximum 5 people per household');
      return;
    }
    setPeople([...people, {
      firstName: '',
      lastName: '',
      isPrimary: false,
      contacts: { email: '', phone: '', mobile: '', workPhone: '' }
    }]);
  };

  // Handle removing a person
  const handleRemovePerson = (index: number) => {
    if (people.length <= 1) return;

    const newPeople = people.filter((_, i) => i !== index);
    // If we removed the primary, make the first person primary
    if (people[index].isPrimary && newPeople.length > 0) {
      newPeople[0].isPrimary = true;
    }
    setPeople(newPeople);
  };

  // Handle updating a person
  const handleUpdatePerson = (index: number, updates: Partial<Person>) => {
    const newPeople = [...people];
    newPeople[index] = { ...newPeople[index], ...updates };

    // If setting as primary, unset others
    if (updates.isPrimary) {
      newPeople.forEach((p, i) => {
        if (i !== index) p.isPrimary = false;
      });
    }

    setPeople(newPeople);
  };

  // Handle updating person contacts
  const handleUpdatePersonContacts = (index: number, contacts: Partial<Person['contacts']>) => {
    const newPeople = [...people];
    newPeople[index].contacts = { ...newPeople[index].contacts, ...contacts };
    setPeople(newPeople);
  };

  // Handle creating the household
  const handleCreate = async () => {
    // Validate
    if (!householdName.trim()) {
      alert('Household name is required');
      return;
    }

    const validPeople = people.filter(p => p.firstName.trim() && p.lastName.trim());
    if (validPeople.length === 0) {
      alert('At least one person with first and last name is required');
      return;
    }

    if (!validPeople.some(p => p.isPrimary)) {
      validPeople[0].isPrimary = true;
    }

    setIsCreating(true);
    try {
      // Format for API
      const householdData = {
        householdName: householdName.trim(),
        address: householdAddress.trim() || undefined,
        people: validPeople.map(p => ({
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          isPrimary: p.isPrimary,
          email: p.contacts.email?.trim() || undefined,
          phone: p.contacts.phone?.trim() || undefined,
          mobile: p.contacts.mobile?.trim() || undefined,
          workPhone: p.contacts.workPhone?.trim() || undefined
        }))
      };

      if (onCreateHousehold) {
        await onCreateHousehold(householdData);
        // Assume the household was created and select it
        // In real implementation, onCreateHousehold should return the created household
        setShowCreateForm(false);
        resetCreateForm();
      }
    } catch (error) {
      console.error('Failed to create household:', error);
      alert('Failed to create household');
    } finally {
      setIsCreating(false);
    }
  };

  // Reset creation form
  const resetCreateForm = () => {
    setHouseholdName('');
    setHouseholdAddress('');
    setPeople([{
      firstName: '',
      lastName: '',
      isPrimary: true,
      contacts: { email: '', phone: '', mobile: '', workPhone: '' }
    }]);
  };

  // Show selected household
  if (selectedHousehold) {
    return (
      <div className={`household-search selected ${className}`}>
        <div className="selected-household">
          <div className="household-info">
            <strong>{selectedHousehold.householdName}</strong>
            {selectedHousehold.address && (
              <span className="household-address"> - {selectedHousehold.address}</span>
            )}
            <div className="household-contacts">
              {selectedHousehold.contacts.map((contact, idx) => (
                <span key={idx} className="contact-chip">
                  {contact.type}: {contact.value}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="btn btn-sm btn-secondary"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Show creation form
  if (showCreateForm) {
    return (
      <div className={`household-search create-form ${className}`}>
        <div className="create-household-form">
          <div className="form-header">
            <h3>{startInCreateMode ? 'New Household' : 'Create New Household'}</h3>
          </div>

          <div className="form-section">
            <label>
              Household Name *
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g., Smith Family"
                disabled={isCreating}
              />
            </label>

            <label>
              Address
              <input
                type="text"
                value={householdAddress}
                onChange={(e) => setHouseholdAddress(e.target.value)}
                placeholder="123 Main St, City, State"
                disabled={isCreating}
              />
            </label>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h4>People in Household</h4>
              {people.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddPerson}
                  className="btn btn-sm btn-secondary"
                  disabled={isCreating}
                >
                  Add Person
                </button>
              )}
            </div>

            {people.map((person, index) => (
              <div key={index} className="person-form">
                <div className="person-header">
                  <h5>Person {index + 1}</h5>
                  {people.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePerson(index)}
                      className="btn btn-sm btn-danger"
                      disabled={isCreating}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-row">
                  <input
                    type="text"
                    placeholder="First Name *"
                    value={person.firstName}
                    onChange={(e) => handleUpdatePerson(index, { firstName: e.target.value })}
                    disabled={isCreating}
                  />
                  <input
                    type="text"
                    placeholder="Last Name *"
                    value={person.lastName}
                    onChange={(e) => handleUpdatePerson(index, { lastName: e.target.value })}
                    disabled={isCreating}
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={person.isPrimary}
                      onChange={(e) => handleUpdatePerson(index, { isPrimary: e.target.checked })}
                      disabled={isCreating}
                    />
                    Primary Contact
                  </label>
                </div>

                <div className="form-row">
                  <input
                    type="email"
                    placeholder="Email"
                    value={person.contacts.email || ''}
                    onChange={(e) => handleUpdatePersonContacts(index, { email: e.target.value })}
                    disabled={isCreating}
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={person.contacts.phone || ''}
                    onChange={(e) => handleUpdatePersonContacts(index, { phone: e.target.value })}
                    disabled={isCreating}
                  />
                </div>

                <div className="form-row">
                  <input
                    type="tel"
                    placeholder="Mobile"
                    value={person.contacts.mobile || ''}
                    onChange={(e) => handleUpdatePersonContacts(index, { mobile: e.target.value })}
                    disabled={isCreating}
                  />
                  <input
                    type="tel"
                    placeholder="Work Phone"
                    value={person.contacts.workPhone || ''}
                    onChange={(e) => handleUpdatePersonContacts(index, { workPhone: e.target.value })}
                    disabled={isCreating}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                if (onCancel) {
                  onCancel();
                } else {
                  setShowCreateForm(false);
                  resetCreateForm();
                }
              }}
              className="btn btn-secondary"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="btn btn-primary"
              disabled={isCreating}
            >
              {isCreating ? <LoadingSpinner size="small" /> : 'Create Household'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show search interface
  return (
    <div className={`household-search ${className}`}>
      <div className="search-container">
        <div className="search-input-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder}
            className="search-input"
          />
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary"
          >
            Create Household
          </button>
        </div>

        {isSearching && (
          <div className="search-loading">
            <LoadingSpinner size="small" />
            <span>Searching households...</span>
          </div>
        )}

        {!isSearching && searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((household) => (
              <div
                key={household.id}
                className="search-result-item"
                onClick={() => handleSelectHousehold(household)}
              >
                <div className="household-name">{household.householdName}</div>
                {household.address && (
                  <div className="household-address">{household.address}</div>
                )}
                <div className="household-contacts">
                  {household.contacts.slice(0, 2).map((contact, idx) => (
                    <span key={idx} className="contact-chip">
                      {contact.type}: {contact.value}
                    </span>
                  ))}
                  {household.contacts.length > 2 && (
                    <span className="more-contacts">+{household.contacts.length - 2} more</span>
                  )}
                </div>
                {household.petCount > 0 && (
                  <div className="pet-count">{household.petCount} pet(s)</div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="no-results">
            No households found. Click "Create Household" to add a new one.
          </div>
        )}
      </div>
    </div>
  );
};

export default HouseholdSearch;