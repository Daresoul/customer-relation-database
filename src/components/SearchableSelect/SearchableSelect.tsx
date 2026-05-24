import React, { useState, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * Value type accepted by SearchableSelect. Widened from the original
 * `string` because consumers commonly use `getValueFromEvent` on the
 * surrounding Form.Item to coerce the value to a numeric ID for the
 * backend, and AntD's controlled-input cycle then hands a number back
 * to us via the `value` prop. We accept either and coerce internally
 * for the option lookup. `null` is the natural "no selection" sentinel
 * from form-clear; `''` is treated identically.
 */
type SearchableValue = string | number | null | undefined;

interface SearchableSelectProps {
  value?: SearchableValue;
  onChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  className?: string;
  onCreateNew?: (value: string) => void;
  // Forwarded to AntD AutoComplete root so E2E tests can target the trigger.
  'data-testid'?: string;
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
  'data-testid': dataTestId,
}) => {
  const [searchText, setSearchText] = useState('');

  // Coerce the incoming form value to a string for comparison against
  // option.value. Form.Item with getValueFromEvent commonly hands us a
  // number (e.g. breedId: 5) while options here are typed as string —
  // without coercion the option lookup silently fails and the raw id
  // "5" leaks into the displayed input.
  const valueAsString =
    value === null || value === undefined ? '' : String(value);

  // The currently-selected option, if any. Used to render the human
  // label instead of the raw id (AutoComplete's default behavior
  // displays the value, not the label).
  const selectedOption = useMemo(() => {
    if (!valueAsString) return undefined;
    return options.find((o) => o.value === valueAsString);
  }, [options, valueAsString]);

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
    // If user is actively typing and there's a selected value, clear it
    // to allow free typing. Compare against the resolved string form so
    // a numeric value (e.g. 5) still triggers the clear when the typed
    // text differs.
    if (valueAsString && text !== valueAsString) {
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

  // What we actually render in the input. Priority:
  //   1. Current search text (the user is actively typing)
  //   2. The label of the currently-selected option (so the user sees
  //      "Labrador" rather than "5" after picking from the dropdown)
  //   3. The raw stringified value as last-resort fallback — e.g. if
  //      options haven't loaded yet but the form has an id from
  //      initialValues. Better than showing nothing in that brief
  //      window between mount and options arriving.
  //   4. Empty.
  const displayValue = searchText
    || selectedOption?.label
    || (valueAsString && !options.length ? valueAsString : '')
    || '';

  return (
    <AutoComplete
      value={displayValue}
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
      data-testid={dataTestId}
    />
  );
};

export default SearchableSelect;
