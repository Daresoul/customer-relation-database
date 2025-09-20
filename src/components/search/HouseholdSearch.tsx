/**
 * T032: Household search component with Ant Design AutoComplete
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
  Badge,
} from 'antd';
import {
  SearchOutlined,
  HomeOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  HeartOutlined,
  CloseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useDebounce } from 'use-debounce';
import type { HouseholdTableRecord } from '../../types/ui.types';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = AutoComplete;

interface HouseholdSearchProps {
  onSelect?: (household: HouseholdTableRecord) => void;
  onSearch?: (query: string) => Promise<HouseholdTableRecord[]>;
  placeholder?: string;
  showRecent?: boolean;
  allowClear?: boolean;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
}

export const HouseholdSearch: React.FC<HouseholdSearchProps> = ({
  onSelect,
  onSearch,
  placeholder = 'Search households by name, phone, or email...',
  showRecent = true,
  allowClear = true,
  size = 'middle',
  style,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch] = useDebounce(searchValue, 300);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<HouseholdTableRecord[]>([]);
  const [recentHouseholds, setRecentHouseholds] = useState<HouseholdTableRecord[]>([]);

  // Get activity status
  const getActivityStatus = useCallback((lastActivity?: string) => {
    if (!lastActivity) return { color: 'default', text: 'No activity' };

    const daysSince = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince <= 30) return { color: 'success', text: 'Active' };
    if (daysSince <= 90) return { color: 'warning', text: 'Recent' };
    return { color: 'default', text: 'Inactive' };
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
    const household = option.household as HouseholdTableRecord;
    if (household && onSelect) {
      onSelect(household);
      setSearchValue('');
      setSearchResults([]);
      
      // Add to recent households
      setRecentHouseholds(prev => {
        const filtered = prev.filter(h => h.id !== household.id);
        return [household, ...filtered].slice(0, 5);
      });
    }
  }, [onSelect]);

  // Clear search
  const handleClear = useCallback(() => {
    setSearchValue('');
    setSearchResults([]);
  }, []);

  // Render household option
  const renderHouseholdOption = useCallback((household: HouseholdTableRecord) => {
    const status = getActivityStatus(household.lastActivity);
    
    return (
      <div
        style={{
          padding: '8px 0',
          borderBottom: '1px solid #303030',
        }}
      >
        <Space align="start" style={{ width: '100%' }}>
          <Avatar
            icon={<HomeOutlined />}
            style={{
              backgroundColor: '#4A90E2',
            }}
            size={40}
          >
            {household.lastName?.charAt(0)}
          </Avatar>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong>{household.lastName}</Text>
                <Badge
                  count={household.petCount || 0}
                  style={{
                    backgroundColor: household.petCount > 0 ? '#52C41A' : '#d9d9d9',
                  }}
                  title={`${household.petCount || 0} pets`}
                />
              </Space>
              <Tag color={status.color}>{status.text}</Tag>
            </div>
            
            {household.primaryContact && (
              <div style={{ marginTop: 4 }}>
                <Space size="small">
                  <UserOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {household.primaryContact}
                  </Text>
                </Space>
              </div>
            )}
            
            <Space size="middle" style={{ marginTop: 4 }}>
              {household.phone && (
                <Space size={4}>
                  <PhoneOutlined style={{ fontSize: 11, color: '#52C41A' }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {household.phone}
                  </Text>
                </Space>
              )}
              {household.email && (
                <Space size={4}>
                  <MailOutlined style={{ fontSize: 11, color: '#1890ff' }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {household.email}
                  </Text>
                </Space>
              )}
            </Space>
            
            {household.address && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {household.address}
                </Text>
              </div>
            )}
          </div>
        </Space>
      </div>
    );
  }, [getActivityStatus]);

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
        options: searchResults.map(household => ({
          value: household.id,
          household,
          label: renderHouseholdOption(household),
        })),
      });
    }

    // Recent households
    if (showRecent && !searchValue && recentHouseholds.length > 0) {
      opts.push({
        label: (
          <div style={{ padding: '4px 0', color: '#8c8c8c', fontSize: 12 }}>
            RECENT HOUSEHOLDS
          </div>
        ),
        options: recentHouseholds.map(household => ({
          value: household.id,
          household,
          label: renderHouseholdOption(household),
        })),
      });
    }

    // No results message
    if (searchValue && !loading && searchResults.length === 0) {
      opts.push({
        label: (
          <div style={{ padding: '16px', textAlign: 'center', color: '#8c8c8c' }}>
            No households found for "{searchValue}"
          </div>
        ),
        options: [],
      });
    }

    return opts;
  }, [searchResults, recentHouseholds, searchValue, loading, showRecent, renderHouseholdOption]);

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
export const HouseholdQuickSearch: React.FC<HouseholdSearchProps> = (props) => (
  <HouseholdSearch
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
export const HouseholdCompactSearch: React.FC<HouseholdSearchProps> = (props) => (
  <HouseholdSearch
    {...props}
    size="small"
    showRecent={false}
    placeholder="Search households..."
  />
);

// Combined search component
export const UniversalSearch: React.FC<{
  mode?: 'patient' | 'household' | 'all';
  onSelectPatient?: (patient: any) => void;
  onSelectHousehold?: (household: HouseholdTableRecord) => void;
  onSearch?: (query: string, mode: string) => Promise<any[]>;
}> = ({ mode = 'all', onSelectPatient, onSelectHousehold, onSearch }) => {
  const [searchMode, setSearchMode] = useState(mode);

  const placeholder = useMemo(() => {
    switch (searchMode) {
      case 'patient':
        return 'Search patients...';
      case 'household':
        return 'Search households...';
      default:
        return 'Search patients and households...';
    }
  }, [searchMode]);

  return (
    <Space.Compact style={{ width: '100%' }}>
      {mode === 'all' && (
        <AutoComplete
          style={{ width: 120 }}
          value={searchMode}
          onChange={setSearchMode}
          options={[
            { value: 'all', label: 'All' },
            { value: 'patient', label: 'Patients' },
            { value: 'household', label: 'Households' },
          ]}
        />
      )}
      <Input
        placeholder={placeholder}
        prefix={<SearchOutlined />}
        style={{ flex: 1 }}
      />
    </Space.Compact>
  );
};