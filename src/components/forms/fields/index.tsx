/**
 * T020: Reusable form field components for Ant Design forms
 */

import React from 'react';
import {
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Switch,
  Radio,
  Checkbox,
  TimePicker,
  FormItemProps,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  HomeOutlined,
  CalendarOutlined,
  NumberOutlined,
} from '@ant-design/icons';
import { validationRules } from '../../../utils/validation/formRules';
import type { Dayjs } from 'dayjs';
import styles from './FormFields.module.css';

const { TextArea } = Input;
const { Option } = Select;

// Base props for all field components
interface BaseFieldProps extends Omit<FormItemProps, 'children'> {
  placeholder?: string;
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
}

// Text input field
interface TextFieldProps extends BaseFieldProps {
  prefix?: React.ReactNode;
  maxLength?: number;
  allowClear?: boolean;
}

export const TextField: React.FC<TextFieldProps> = ({
  name,
  label,
  rules,
  placeholder,
  prefix,
  maxLength,
  allowClear = true,
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <Input
        placeholder={placeholder}
        prefix={prefix}
        maxLength={maxLength}
        allowClear={allowClear}
        disabled={disabled}
        size={size}
      />
    </Form.Item>
  );
};

// Name field with built-in validation
export const NameField: React.FC<BaseFieldProps> = ({
  name,
  label,
  required = false,
  placeholder,
  ...props
}) => {
  const rules = [
    required && validationRules.required(`${label} is required`),
    ...validationRules.name(100),
  ].filter(Boolean);

  return (
    <TextField
      name={name}
      label={label}
      rules={rules}
      placeholder={placeholder || `Enter ${label?.toString().toLowerCase()}`}
      prefix={<UserOutlined />}
      {...props}
    />
  );
};

// Email field with validation
export const EmailField: React.FC<BaseFieldProps> = ({
  name,
  label = 'Email',
  required = false,
  placeholder = 'Enter email address',
  ...props
}) => {
  const rules = [
    required && validationRules.required('Email is required'),
    validationRules.email(),
  ].filter(Boolean);

  return (
    <TextField
      name={name}
      label={label}
      rules={rules}
      placeholder={placeholder}
      prefix={<MailOutlined />}
      {...props}
    />
  );
};

// Phone field with validation
export const PhoneField: React.FC<BaseFieldProps> = ({
  name,
  label = 'Phone',
  required = false,
  placeholder = 'Enter phone number',
  ...props
}) => {
  const rules = [
    required && validationRules.required('Phone number is required'),
    validationRules.phone(),
  ].filter(Boolean);

  return (
    <TextField
      name={name}
      label={label}
      rules={rules}
      placeholder={placeholder}
      prefix={<PhoneOutlined />}
      {...props}
    />
  );
};

// Select field
interface SelectFieldProps extends BaseFieldProps {
  options: { value: string | number; label: string; disabled?: boolean }[];
  allowClear?: boolean;
  mode?: 'multiple' | 'tags';
  showSearch?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  name,
  label,
  rules,
  placeholder,
  options,
  allowClear = true,
  mode,
  showSearch = false,
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <Select
        placeholder={placeholder}
        allowClear={allowClear}
        mode={mode}
        showSearch={showSearch}
        disabled={disabled}
        size={size}
        filterOption={(input, option) =>
          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
      >
        {options.map((opt) => (
          <Option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </Option>
        ))}
      </Select>
    </Form.Item>
  );
};

// Date field
interface DateFieldProps extends BaseFieldProps {
  format?: string;
  disabledDate?: (current: Dayjs) => boolean;
  showTime?: boolean;
}

export const DateField: React.FC<DateFieldProps> = ({
  name,
  label,
  rules,
  placeholder,
  format = 'YYYY-MM-DD',
  disabledDate,
  showTime = false,
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <DatePicker
        className={styles.fullWidth}
        placeholder={placeholder}
        format={format}
        disabledDate={disabledDate}
        showTime={showTime}
        disabled={disabled}
        size={size}
        suffixIcon={<CalendarOutlined />}
      />
    </Form.Item>
  );
};

// Number field
interface NumberFieldProps extends BaseFieldProps {
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  prefix?: React.ReactNode;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  name,
  label,
  rules,
  placeholder,
  min,
  max,
  step = 1,
  precision,
  prefix,
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <InputNumber
        className={styles.fullWidth}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        precision={precision}
        prefix={prefix}
        disabled={disabled}
        size={size}
      />
    </Form.Item>
  );
};

// Text area field
interface TextAreaFieldProps extends BaseFieldProps {
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
  name,
  label,
  rules,
  placeholder,
  rows = 4,
  maxLength = 500,
  showCount = true,
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <TextArea
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        showCount={showCount}
        disabled={disabled}
        size={size}
      />
    </Form.Item>
  );
};

// Switch field
interface SwitchFieldProps extends BaseFieldProps {
  checkedChildren?: React.ReactNode;
  unCheckedChildren?: React.ReactNode;
}

export const SwitchField: React.FC<SwitchFieldProps> = ({
  name,
  label,
  checkedChildren = 'Yes',
  unCheckedChildren = 'No',
  disabled,
  ...formItemProps
}) => {
  return (
    <Form.Item
      name={name}
      label={label}
      valuePropName="checked"
      {...formItemProps}
    >
      <Switch
        checkedChildren={checkedChildren}
        unCheckedChildren={unCheckedChildren}
        disabled={disabled}
      />
    </Form.Item>
  );
};

// Radio group field
interface RadioGroupFieldProps extends BaseFieldProps {
  options: { value: string | number; label: string; disabled?: boolean }[];
  buttonStyle?: 'outline' | 'solid';
}

export const RadioGroupField: React.FC<RadioGroupFieldProps> = ({
  name,
  label,
  rules,
  options,
  buttonStyle = 'outline',
  disabled,
  size = 'middle',
  ...formItemProps
}) => {
  return (
    <Form.Item name={name} label={label} rules={rules} {...formItemProps}>
      <Radio.Group buttonStyle={buttonStyle} disabled={disabled} size={size}>
        {options.map((opt) => (
          <Radio.Button key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </Radio.Button>
        ))}
      </Radio.Group>
    </Form.Item>
  );
};

// Checkbox field
interface CheckboxFieldProps extends BaseFieldProps {
  children: React.ReactNode;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  name,
  label,
  children,
  disabled,
  ...formItemProps
}) => {
  return (
    <Form.Item
      name={name}
      label={label}
      valuePropName="checked"
      {...formItemProps}
    >
      <Checkbox disabled={disabled}>{children}</Checkbox>
    </Form.Item>
  );
};

// Species select field (specific to veterinary app)
export const SpeciesField: React.FC<BaseFieldProps> = ({
  name = 'species',
  label = 'Species',
  required = false,
  ...props
}) => {
  const speciesOptions = [
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
    <SelectField
      name={name}
      label={label}
      rules={required ? [validationRules.required('Species is required')] : []}
      placeholder="Select species"
      options={speciesOptions}
      showSearch
      {...props}
    />
  );
};

// Gender select field
export const GenderField: React.FC<BaseFieldProps> = ({
  name = 'gender',
  label = 'Gender',
  ...props
}) => {
  const genderOptions = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Unknown', label: 'Unknown' },
  ];

  return (
    <SelectField
      name={name}
      label={label}
      placeholder="Select gender"
      options={genderOptions}
      {...props}
    />
  );
};

// Weight field with kg suffix
export const WeightField: React.FC<BaseFieldProps> = ({
  name = 'weight',
  label = 'Weight (kg)',
  ...props
}) => {
  return (
    <NumberField
      name={name}
      label={label}
      rules={[validationRules.weight()]}
      placeholder="Enter weight"
      min={0.01}
      max={500}
      step={0.1}
      precision={2}
      {...props}
    />
  );
};

// Address fields group
export const AddressFields: React.FC = () => {
  return (
    <>
      <TextField
        name={['address', 'street']}
        label="Street Address"
        placeholder="Enter street address"
        prefix={<HomeOutlined />}
      />
      <Form.Item label="City/State/ZIP">
        <Input.Group compact>
          <Form.Item name={['address', 'city']} noStyle>
            <Input className={styles.addressCity} placeholder="City" />
          </Form.Item>
          <Form.Item name={['address', 'state']} noStyle>
            <Input className={styles.addressState} placeholder="State" />
          </Form.Item>
          <Form.Item name={['address', 'zipCode']} noStyle>
            <Input className={styles.addressZip} placeholder="ZIP Code" />
          </Form.Item>
        </Input.Group>
      </Form.Item>
    </>
  );
};

// Export all field components
export default {
  TextField,
  NameField,
  EmailField,
  PhoneField,
  SelectField,
  DateField,
  NumberField,
  TextAreaField,
  SwitchField,
  RadioGroupField,
  CheckboxField,
  SpeciesField,
  GenderField,
  WeightField,
  AddressFields,
};