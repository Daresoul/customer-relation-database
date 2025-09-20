/**
 * T027: Custom Select component wrapping Ant Design Select
 */

import React from 'react';
import { Select as AntSelect, SelectProps as AntSelectProps } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  HeartOutlined,
  HomeOutlined,
  CalendarOutlined,
  TagOutlined,
} from '@ant-design/icons';

const { Option } = AntSelect;

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps extends Omit<AntSelectProps, 'options'> {
  options?: SelectOption[];
  iconType?: 'user' | 'team' | 'heart' | 'home' | 'calendar' | 'tag';
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

const iconMap = {
  user: <UserOutlined />,
  team: <TeamOutlined />,
  heart: <HeartOutlined />,
  home: <HomeOutlined />,
  calendar: <CalendarOutlined />,
  tag: <TagOutlined />,
};

export const Select: React.FC<SelectProps> = ({
  options = [],
  iconType,
  fullWidth = false,
  error = false,
  helperText,
  style,
  children,
  ...props
}) => {
  const icon = iconType ? iconMap[iconType] : undefined;

  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width || 200,
  };

  return (
    <div style={{ width: fullWidth ? '100%' : undefined }}>
      <AntSelect
        status={error ? 'error' : undefined}
        style={customStyle}
        suffixIcon={icon}
        {...props}
      >
        {children ||
          options.map((option) => (
            <Option key={option.value} value={option.value} disabled={option.disabled}>
              {option.icon && <span style={{ marginRight: 8 }}>{option.icon}</span>}
              {option.label}
            </Option>
          ))}
      </AntSelect>
      {helperText && (
        <div style={{
          fontSize: '12px',
          marginTop: '4px',
          color: error ? '#ff4d4f' : '#8c8c8c'
        }}>
          {helperText}
        </div>
      )}
    </div>
  );
};

// Species Select
export const SpeciesSelect: React.FC<SelectProps> = (props) => {
  const speciesOptions: SelectOption[] = [
    { value: 'Dog', label: 'Dog' },
    { value: 'Cat', label: 'Cat' },
    { value: 'Bird', label: 'Bird' },
    { value: 'Rabbit', label: 'Rabbit' },
    { value: 'Hamster', label: 'Hamster' },
    { value: 'Guinea Pig', label: 'Guinea Pig' },
    { value: 'Reptile', label: 'Reptile' },
    { value: 'Fish', label: 'Fish' },
    { value: 'Other', label: 'Other' },
  ];

  return (
    <Select
      placeholder="Select species"
      options={speciesOptions}
      iconType="heart"
      {...props}
    />
  );
};

// Gender Select
export const GenderSelect: React.FC<SelectProps> = (props) => {
  const genderOptions: SelectOption[] = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Unknown', label: 'Unknown' },
  ];

  return (
    <Select
      placeholder="Select gender"
      options={genderOptions}
      {...props}
    />
  );
};

// Status Select
export const StatusSelect: React.FC<SelectProps> = (props) => {
  const statusOptions: SelectOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <Select
      placeholder="Select status"
      options={statusOptions}
      iconType="tag"
      {...props}
    />
  );
};

// Multi-select variant
export const MultiSelect: React.FC<SelectProps> = (props) => (
  <Select mode="multiple" {...props} />
);

// Tags select variant
export const TagsSelect: React.FC<SelectProps> = (props) => (
  <Select mode="tags" {...props} />
);

// Export Option for direct use
export { Option };