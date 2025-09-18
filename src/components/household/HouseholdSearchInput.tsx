import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useQuickHouseholdSearch } from '../../hooks/useHouseholdSearch';
import { HouseholdSearchResult } from '../../types/household';

interface HouseholdSearchInputProps {
  onSelect: (household: HouseholdSearchResult | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  value?: string;
  onClear?: () => void;
}

export const HouseholdSearchInput: React.FC<HouseholdSearchInputProps> = ({
  onSelect,
  placeholder = 'Search households by name, phone, or email...',
  className = '',
  autoFocus = false,
  value = '',
  onClear,
}) => {
  const { query, setQuery, suggestions, isLoading } = useQuickHouseholdSearch(value, {
    debounceMs: 300,
    limit: 8,
  });

  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  useEffect(() => {
    setShowDropdown(suggestions.length > 0 && query.length >= 2);
    setSelectedIndex(-1);
  }, [suggestions, query]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectSuggestion = async (suggestion: { id: number; name: string }) => {
    // Fetch full household details
    try {
      const { getHouseholdWithPeople } = await import('../../services/householdService');
      const household = await getHouseholdWithPeople(suggestion.id);
      if (household) {
        const searchResult: HouseholdSearchResult = {
          id: household.household.id,
          householdName: household.household.householdName,
          address: household.household.address,
          people: household.people,
          relevanceScore: 1,
          snippet: undefined,
        };
        onSelect(searchResult);
        setQuery(suggestion.name);
        setShowDropdown(false);
      }
    } catch (error) {
      console.error('Failed to fetch household details:', error);
    }
  };

  const handleClear = () => {
    setQuery('');
    onSelect(null);
    setShowDropdown(false);
    if (onClear) onClear();
    inputRef.current?.focus();
  };

  return (
    <div className={`household-search-container ${className}`}>
      <div className="search-input-wrapper">
        {isLoading && (
          <div className="input-loading-icon">
            <Loader2 className="loading-spinner-icon" />
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          className={`household-search-input-field ${isLoading ? 'with-icon' : ''}`}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          autoFocus={autoFocus}
        />
        {query && (
          <div className="input-clear-button">
            <button
              type="button"
              onClick={handleClear}
              className="clear-btn"
            >
              <X className="clear-icon" />
            </button>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="search-dropdown"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className={`dropdown-item ${selectedIndex === index ? 'selected' : ''}`}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="suggestion-name">
                {suggestion.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};