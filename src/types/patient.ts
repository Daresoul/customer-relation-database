/**
 * Type definitions for Patient/Pet detail page
 */

import { Patient } from './models';

// Extended patient with calculated age
export interface PatientWithAge extends Patient {
  age?: {
    years: number;
    months: number;
    display: string; // e.g., "2 years 3 months" or "6 months"
  };
}

// Contact information for household members
export interface Contact {
  id: number;
  type: 'phone' | 'email' | 'mobile';
  value: string;
  isPrimary: boolean;
}

// Person/Owner information
export interface PersonWithContacts {
  id: number;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  contacts?: Contact[];
}

// Household information for patient detail view
export interface HouseholdSummary {
  id: number;
  householdName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  primaryContact?: PersonWithContacts;
  people?: PersonWithContacts[];
}

// Complete patient detail with related data
export interface PatientDetail extends PatientWithAge {
  household?: HouseholdSummary;
}


// Response types
export interface DeletePatientResponse {
  success: boolean;
  message: string;
  redirectTo: string;
}

// Validation types
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationErrorResponse {
  success: false;
  errors: ValidationError[];
}

// Species options for dropdowns
export const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'hamster', label: 'Hamster' },
  { value: 'guinea_pig', label: 'Guinea Pig' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'other', label: 'Other' }
] as const;

// Gender options for dropdowns
export const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Unknown', label: 'Unknown' }
] as const;

// Field validation rules
export const PATIENT_FIELD_RULES = {
  name: {
    required: true,
    max: 100,
    message: 'Name is required and must be less than 100 characters'
  },
  species: {
    required: true,
    message: 'Species is required'
  },
  breed: {
    max: 50,
    message: 'Breed must be less than 50 characters'
  },
  weight: {
    min: 0.01,
    max: 500,
    message: 'Weight must be between 0.01 and 500 kg'
  },
  microchipId: {
    pattern: /^[A-Za-z0-9]*$/,
    max: 20,
    message: 'Microchip ID must be alphanumeric and less than 20 characters'
  },
  medicalNotes: {
    max: 5000,
    message: 'Medical notes must be less than 5000 characters'
  }
};