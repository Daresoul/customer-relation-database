/**
 * T031: Patient search component with Ant Design AutoComplete
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  AutoComplete,
  Input,
  Space,
  Tag,
  Avatar,
  Typography,
  Spin,
  Button,
} from 'antd';
import {
  SearchOutlined,
  HeartOutlined,
  UserOutlined,
  CalendarOutlined,
  HomeOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useDebounce } from 'use-debounce';
import type { Patient } from '../../types';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = AutoComplete;

interface PatientSearchProps {
  onSelect?: (patient: Patient) => void;
  onSearch?: (query: string) => Promise<Patient[]>;
  placeholder?: string;
  showRecent?: boolean;
  allowClear?: boolean;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
}

export const PatientSearch: React.FC<PatientSearchProps> = ({
  onSelect,
  onSearch,
  placeholder = 'Search patients by name, species, or microchip...',
  showRecent = true,
  allowClear = true,
  size = 'middle',
  style,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch] = useDebounce(searchValue, 300);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);

  // Calculate age from date of birth
  const calculateAge = useCallback((dateOfBirth?: string) => {
    if (!dateOfBirth) return 'Unknown age';
    const years = dayjs().diff(dayjs(dateOfBirth), 'year');
    const months = dayjs().diff(dayjs(dateOfBirth), 'month') % 12;
    
    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''} old`;
    }
    return `${months} month${months !== 1 ? 's' : ''} old`;
  }, []);

  // Get species color
  const getSpeciesColor = useCallback((species: string) => {
    const colors: Record<string, string> = {
      'Dog': '#1890ff',
      'Cat': '#722ed1',
      'Bird': '#13c2c2',
      'Rabbit': '#eb2f96',
      'Reptile': '#52c41a',
      'Fish': '#2f54eb',
      'Other': '#8c8c8c',
    };
    return colors[species] || '#8c8c8c';
  }, []);

  // Handle search
  const handleSearch = useCallback(async (value: string) => {
    setSearchValue(value);
    
    if (!value.trim() || !onSearch) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const results = await onSearch(value);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [onSearch]);

  // Handle selection
  const handleSelect = useCallback((value: string, option: any) => {
    const patient = option.patient as Patient;
    if (patient && onSelect) {
      onSelect(patient);
      setSearchValue('');
      setSearchResults([]);
      
      // Add to recent patients
      setRecentPatients(prev => {
        const filtered = prev.filter(p => p.id !== patient.id);
        return [patient, ...filtered].slice(0, 5);
      });
    }
  }, [onSelect]);

  // Clear search
  const handleClear = useCallback(() => {
    setSearchValue('');
    setSearchResults([]);
  }, []);

  // Render patient option
  const renderPatientOption = useCallback((patient: Patient) => (
    <div
      style={{
        padding: '8px 0',
        borderBottom: '1px solid #303030',
      }}
    >
      <Space align="start" style={{ width: '100%' }}>
        <Avatar
          icon={<HeartOutlined />}
          style={{
            backgroundColor: getSpeciesColor(patient.species),
          }}
          size={40}
        >
          {patient.name?.charAt(0)}
        </Avatar>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>{patient.name}</Text>
            <Tag color={patient.isActive !== false ? 'success' : 'default'}>
              {patient.isActive !== false ? 'Active' : 'Inactive'}
            </Tag>
          </div>
          <Space size="small" style={{ marginTop: 4 }}>
            <Tag color={getSpeciesColor(patient.species)}>
              {patient.species}
            </Tag>
            {patient.breed && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {patient.breed}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              <CalendarOutlined /> {calculateAge(patient.dateOfBirth)}
            </Text>
          </Space>
          {patient.microchipId && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Microchip: {patient.microchipId}
              </Text>
            </div>
          )}
        </div>
      </Space>
    </div>
  ), [getSpeciesColor, calculateAge]);

  // Options for autocomplete
  const options = useMemo(() => {
    const opts = [];

    // Search results
    if (searchResults.length > 0) {
      opts.push({
        label: (
          <div style={{ padding: '4px 0', color: '#8c8c8c', fontSize: 12 }}>
            SEARCH RESULTS ({searchResults.length})
          </div>
        ),
        options: searchResults.map(patient => ({
          value: patient.id,
          patient,
          label: renderPatientOption(patient),
        })),
      });
    }

    // Recent patients
    if (showRecent && !searchValue && recentPatients.length > 0) {
      opts.push({
        label: (
          <div style={{ padding: '4px 0', color: '#8c8c8c', fontSize: 12 }}>
            RECENT PATIENTS
          </div>
        ),
        options: recentPatients.map(patient => ({
          value: patient.id,
          patient,
          label: renderPatientOption(patient),
        })),
      });
    }

    // No results message
    if (searchValue && !loading && searchResults.length === 0) {
      opts.push({
        label: (
          <div style={{ padding: '16px', textAlign: 'center', color: '#8c8c8c' }}>
            No patients found for "{searchValue}"
          </div>
        ),
        options: [],
      });
    }

    return opts;
  }, [searchResults, recentPatients, searchValue, loading, showRecent, renderPatientOption]);

  return (
    <AutoComplete
      value={searchValue}
      options={options}
      onSelect={handleSelect}
      onSearch={handleSearch}
      style={{ width: '100%', ...style }}
      dropdownMatchSelectWidth={500}
      dropdownStyle={{
        maxHeight: 400,
        overflow: 'auto',
      }}
    >
      <Input
        size={size}
        placeholder={placeholder}
        prefix={<SearchOutlined />}
        suffix={
          <Space size="small">
            {loading && <Spin size="small" />}
            {allowClear && searchValue && (
              <CloseOutlined
                style={{ cursor: 'pointer', color: '#8c8c8c' }}
                onClick={handleClear}
              />
            )}
          </Space>
        }
      />
    </AutoComplete>
  );
};

// Quick search bar variant
export const PatientQuickSearch: React.FC<PatientSearchProps> = (props) => (
  <PatientSearch
    {...props}
    size="large"
    style={{
      ...props.style,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      borderRadius: '8px',
    }}
  />
);

// Compact search variant
export const PatientCompactSearch: React.FC<PatientSearchProps> = (props) => (
  <PatientSearch
    {...props}
    size="small"
    showRecent={false}
    placeholder="Search patients..."
  />
);