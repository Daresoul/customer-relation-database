/**
 * T026: Custom Input components wrapping Ant Design Input
 */

import React from 'react';
import {
  Input as AntInput,
  InputProps as AntInputProps,
  InputNumber as AntInputNumber,
  InputNumberProps as AntInputNumberProps,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  SearchOutlined,
  LockOutlined,
  HomeOutlined,
  NumberOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import styles from './Common.module.css';

const { TextArea: AntTextArea, Search: AntSearch, Password: AntPassword } = AntInput;

export interface InputProps extends AntInputProps {
  iconType?: 'user' | 'email' | 'phone' | 'search' | 'lock' | 'home' | 'number' | 'calendar';
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

const iconMap = {
  user: <UserOutlined />,
  email: <MailOutlined />,
  phone: <PhoneOutlined />,
  search: <SearchOutlined />,
  lock: <LockOutlined />,
  home: <HomeOutlined />,
  number: <NumberOutlined />,
  calendar: <CalendarOutlined />,
};

export const Input: React.FC<InputProps> = ({
  iconType,
  fullWidth = false,
  error = false,
  helperText,
  style,
  ...props
}) => {
  const icon = iconType ? iconMap[iconType] : undefined;

  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width,
  };

  return (
    <div className={fullWidth ? styles.inputContainer : undefined}>
      <AntInput
        prefix={icon}
        status={error ? 'error' : undefined}
        style={customStyle}
        {...props}
      />
      {helperText && (
        <div className={error ? styles.inputHelperError : styles.inputHelperText}>
          {helperText}
        </div>
      )}
    </div>
  );
};

// TextArea Component
export interface TextAreaProps extends React.ComponentProps<typeof AntTextArea> {
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  fullWidth = false,
  error = false,
  helperText,
  style,
  ...props
}) => {
  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width,
  };

  return (
    <div className={fullWidth ? styles.inputContainer : undefined}>
      <AntTextArea
        status={error ? 'error' : undefined}
        style={customStyle}
        {...props}
      />
      {helperText && (
        <div className={error ? styles.inputHelperError : styles.inputHelperText}>
          {helperText}
        </div>
      )}
    </div>
  );
};

// Search Input Component
export interface SearchInputProps extends React.ComponentProps<typeof AntSearch> {
  fullWidth?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  fullWidth = false,
  style,
  ...props
}) => {
  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width,
  };

  return (
    <AntSearch
      style={customStyle}
      enterButton
      {...props}
    />
  );
};

// Password Input Component
export interface PasswordInputProps extends React.ComponentProps<typeof AntPassword> {
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  fullWidth = false,
  error = false,
  helperText,
  style,
  ...props
}) => {
  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width,
  };

  return (
    <div className={fullWidth ? styles.inputContainer : undefined}>
      <AntPassword
        prefix={<LockOutlined />}
        status={error ? 'error' : undefined}
        style={customStyle}
        {...props}
      />
      {helperText && (
        <div className={error ? styles.inputHelperError : styles.inputHelperText}>
          {helperText}
        </div>
      )}
    </div>
  );
};

// Number Input Component
export interface NumberInputProps extends AntInputNumberProps {
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  fullWidth = false,
  error = false,
  helperText,
  style,
  ...props
}) => {
  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : style?.width,
  };

  return (
    <div className={fullWidth ? styles.inputContainer : undefined}>
      <AntInputNumber
        status={error ? 'error' : undefined}
        style={customStyle}
        {...props}
      />
      {helperText && (
        <div className={error ? styles.inputHelperError : styles.inputHelperText}>
          {helperText}
        </div>
      )}
    </div>
  );
};

// Export preset input configurations
export const EmailInput: React.FC<InputProps> = (props) => (
  <Input iconType="email" type="email" placeholder="Enter email address" {...props} />
);

export const PhoneInput: React.FC<InputProps> = (props) => (
  <Input iconType="phone" type="tel" placeholder="Enter phone number" {...props} />
);

export const NameInput: React.FC<InputProps> = (props) => (
  <Input iconType="user" placeholder="Enter name" {...props} />
);

export const AddressInput: React.FC<InputProps> = (props) => (
  <Input iconType="home" placeholder="Enter address" {...props} />
);