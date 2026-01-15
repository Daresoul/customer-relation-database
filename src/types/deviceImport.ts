/**
 * Types for device import patient data extraction and validation
 */

/**
 * Patient data extracted from device files
 */
export interface ExtractedPatientData {
  name?: string;
  species?: string;
  dateOfBirth?: string;  // ISO format YYYY-MM-DD
  gender?: 'Male' | 'Female' | 'Unknown';
  sources: string[];  // File names that contributed this data
}

/**
 * Conflict when multiple files have different values for the same field
 */
export interface PatientDataConflict {
  field: keyof Omit<ExtractedPatientData, 'sources'>;
  values: Array<{
    value: string;
    source: string;  // File name
  }>;
}

/**
 * Result of validating device files against selected patient or each other
 */
export interface ValidationResult {
  warnings: ValidationWarning[];
  errors: ValidationError[];
  isValid: boolean;
}

/**
 * Warning that doesn't prevent submission but should be shown to user
 */
export interface ValidationWarning {
  type: ValidationWarningType;
  message: string;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Error that prevents submission
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Types of validation warnings (extensible)
 */
export type ValidationWarningType =
  | 'patient_name_mismatch'      // Selected patient name ≠ file patient name
  | 'species_mismatch'           // Selected patient species ≠ file species
  | 'multi_file_name_conflict'   // Multiple files have different patient names
  | 'multi_file_species_conflict' // Multiple files have different species
  | 'date_format_invalid'        // DOB couldn't be parsed
  | 'species_not_found';         // Species in file doesn't exist in DB

/**
 * Types of validation errors (extensible)
 */
export type ValidationErrorType =
  | 'no_patient_selected'
  | 'no_files_selected';

/**
 * Raw test results from device file (as stored in PendingDeviceFile)
 */
export interface DeviceTestResults {
  // Common fields extracted by HL7 parser
  patient_name?: string;
  species?: string;
  birth_date_alt?: string;  // HL7 format: YYYYMMDDHHmmss
  gender_alt?: string;      // M, F, O, or full words

  // Other test parameters (device-specific)
  [key: string]: string | undefined;
}
