import React, { useState, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchableSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  className?: string;
  onCreateNew?: (value: string) => void;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  disabled = false,
  loading = false,
  allowClear = true,
  className,
  onCreateNew,
}) => {
  const [searchText, setSearchText] = useState('');

  // Filter options based on search text
  const filteredOptions = useMemo(() => {
    if (!searchText) {
      return options;
    }

    const searchLower = searchText.toLowerCase();
    return options.filter(option =>
      option.label.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower)
    );
  }, [options, searchText]);

  const handleSearch = (text: string) => {
    setSearchText(text);
    // If user is actively typing and there's a selected value, clear it to allow free typing
    if (value && text !== value) {
      onChange?.('');
    }
  };

  const handleSelect = (selectedValue: string) => {
    onChange?.(selectedValue);
    setSearchText('');
  };

  const handleChange = (newValue: string) => {
    if (!newValue) {
      // Clear was clicked
      onChange?.('');
      setSearchText('');
    } else {
      setSearchText(newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && searchText && onCreateNew) {
      // Check if the current search text matches any existing option
      const exactMatch = options.some(
        option => option.value.toLowerCase() === searchText.toLowerCase()
      );

      if (!exactMatch) {
        // Prevent default form submission
        e.preventDefault();
        e.stopPropagation();
        // Trigger create new callback
        onCreateNew(searchText);
        setSearchText('');
      }
    }
  };

  return (
    <AutoComplete
      value={value || searchText}
      options={filteredOptions}
      onSearch={handleSearch}
      onSelect={handleSelect}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled || loading}
      allowClear={allowClear}
      className={className}
      filterOption={false} // We handle filtering ourselves
      notFoundContent={loading ? <Spin size="small" /> : 'No results found'}
      suffixIcon={loading ? <Spin size="small" /> : <SearchOutlined />}
      style={{ width: '100%' }}
    />
  );
};

export default SearchableSelect;
