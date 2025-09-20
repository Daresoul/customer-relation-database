/**
 * T019: Form validation rules for Ant Design forms
 */

import type { Rule } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

/**
 * Common validation rules for form fields
 */
export const validationRules = {
  // Required field
  required: (message?: string): Rule => ({
    required: true,
    message: message || 'This field is required',
  }),

  // Email validation
  email: (): Rule => ({
    type: 'email',
    message: 'Please enter a valid email address',
  }),

  // Phone number validation
  phone: (): Rule => ({
    pattern: /^[\d\s\-\+\(\)]+$/,
    message: 'Please enter a valid phone number',
  }),

  // Name validation (letters, spaces, hyphens, apostrophes)
  name: (maxLength: number = 100): Rule[] => [
    {
      pattern: /^[a-zA-Z\s'\-]+$/,
      message: 'Name can only contain letters, spaces, hyphens, and apostrophes',
    },
    {
      max: maxLength,
      message: `Name cannot exceed ${maxLength} characters`,
    },
  ],

  // Weight validation for animals
  weight: (): Rule => ({
    type: 'number',
    min: 0.01,
    max: 500,
    message: 'Weight must be between 0.01 and 500 kg',
  }),

  // Microchip validation (alphanumeric, specific length)
  microchip: (): Rule[] => [
    {
      max: 20,
      message: 'Microchip ID cannot exceed 20 characters',
    },
    {
      pattern: /^[A-Za-z0-9]*$/,
      message: 'Microchip ID can only contain letters and numbers',
    },
  ],

  // Date validation (cannot be future)
  pastDate: (fieldName: string = 'Date'): Rule => ({
    validator: (_, value: Dayjs | null) => {
      if (!value) {
        return Promise.resolve();
      }
      if (value.isAfter(dayjs())) {
        return Promise.reject(new Error(`${fieldName} cannot be in the future`));
      }
      return Promise.resolve();
    },
  }),

  // Age validation for date of birth
  dateOfBirth: (): Rule => ({
    validator: (_, value: Dayjs | null) => {
      if (!value) {
        return Promise.resolve();
      }
      if (value.isAfter(dayjs())) {
        return Promise.reject(new Error('Date of birth cannot be in the future'));
      }
      const age = dayjs().diff(value, 'year');
      if (age > 50) {
        return Promise.reject(new Error('Please verify the date - age exceeds 50 years'));
      }
      return Promise.resolve();
    },
  }),

  // Text area with max length
  textArea: (maxLength: number = 500): Rule => ({
    max: maxLength,
    message: `Cannot exceed ${maxLength} characters`,
  }),

  // URL validation
  url: (): Rule => ({
    type: 'url',
    message: 'Please enter a valid URL',
  }),

  // Number range validation
  numberRange: (min: number, max: number, fieldName: string = 'Value'): Rule => ({
    type: 'number',
    min,
    max,
    message: `${fieldName} must be between ${min} and ${max}`,
  }),

  // Custom pattern validation
  pattern: (pattern: RegExp, message: string): Rule => ({
    pattern,
    message,
  }),

  // Conditional required
  conditionalRequired: (condition: boolean, message?: string): Rule | undefined => {
    if (condition) {
      return {
        required: true,
        message: message || 'This field is required',
      };
    }
    return undefined;
  },

  // At least one field required in a group
  atLeastOne: (fields: string[], message?: string): Rule => ({
    validator: (_, value, callback) => {
      const form = (callback as any).form;
      const values = fields.map(field => form.getFieldValue(field));
      if (values.some(v => v !== undefined && v !== null && v !== '')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error(message || 'At least one field must be filled'));
    },
  }),

  // Match another field (e.g., password confirmation)
  match: (fieldName: string, message?: string): Rule => ({
    validator: (rule, value) => {
      const form = (rule as any).form;
      const compareValue = form.getFieldValue(fieldName);
      if (value && value !== compareValue) {
        return Promise.reject(new Error(message || 'Fields do not match'));
      }
      return Promise.resolve();
    },
  }),

  // File upload validation
  file: (maxSize: number, allowedTypes?: string[]): Rule => ({
    validator: (_, fileList) => {
      if (!fileList || fileList.length === 0) {
        return Promise.resolve();
      }

      const file = fileList[0];

      // Check size
      if (file.size > maxSize) {
        return Promise.reject(new Error(`File size must not exceed ${maxSize / 1024 / 1024}MB`));
      }

      // Check type
      if (allowedTypes && !allowedTypes.includes(file.type)) {
        return Promise.reject(new Error(`File type must be one of: ${allowedTypes.join(', ')}`));
      }

      return Promise.resolve();
    },
  }),
};

/**
 * Preset validation rule sets for common forms
 */
export const formRuleSets = {
  // Patient form rules
  patient: {
    name: [
      validationRules.required('Patient name is required'),
      ...validationRules.name(100),
    ],
    species: [validationRules.required('Species is required')],
    breed: validationRules.name(50),
    dateOfBirth: [validationRules.dateOfBirth()],
    weight: [validationRules.weight()],
    microchip: validationRules.microchip(),
    gender: [],
    color: [{ max: 50, message: 'Color description cannot exceed 50 characters' }],
    notes: [validationRules.textArea(500)],
  },

  // Household form rules
  household: {
    lastName: [
      validationRules.required('Household name is required'),
      ...validationRules.name(100),
    ],
    contact: {
      firstName: [
        validationRules.required('First name is required'),
        ...validationRules.name(50),
      ],
      lastName: [
        validationRules.required('Last name is required'),
        ...validationRules.name(50),
      ],
      phone: [
        validationRules.required('Phone number is required'),
        validationRules.phone(),
      ],
      email: [validationRules.email()],
      relationship: [{ max: 50, message: 'Relationship cannot exceed 50 characters' }],
    },
    address: {
      street: [{ max: 100, message: 'Street address cannot exceed 100 characters' }],
      city: [{ max: 50, message: 'City name cannot exceed 50 characters' }],
      state: [{ max: 20, message: 'State cannot exceed 20 characters' }],
      zipCode: [{ pattern: /^\d{5}(-\d{4})?$/, message: 'Invalid ZIP code format' }],
    },
    notes: [validationRules.textArea(500)],
  },

  // Appointment form rules
  appointment: {
    date: [
      validationRules.required('Appointment date is required'),
      {
        validator: (_, value: Dayjs | null) => {
          if (!value) return Promise.resolve();
          if (value.isBefore(dayjs().startOf('day'))) {
            return Promise.reject(new Error('Cannot schedule appointments in the past'));
          }
          return Promise.resolve();
        },
      },
    ],
    time: [validationRules.required('Appointment time is required')],
    duration: [validationRules.numberRange(15, 240, 'Duration')],
    reason: [
      validationRules.required('Reason for visit is required'),
      validationRules.textArea(200),
    ],
    notes: [validationRules.textArea(500)],
  },
};

/**
 * Helper function to get validation status
 */
export const getValidationStatus = (error?: string): 'error' | 'success' | undefined => {
  if (error) return 'error';
  return undefined;
};

/**
 * Helper to validate form before submission
 */
export const validateFormBeforeSubmit = async (form: any): Promise<boolean> => {
  try {
    await form.validateFields();
    return true;
  } catch (error) {
    console.error('Form validation failed:', error);
    return false;
  }
};