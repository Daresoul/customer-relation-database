/**
 * Validation framework for device import data
 * Extensible design to support future validation rules
 */

import type { PendingDeviceFile } from '../contexts/DeviceImportContext';
import type {
  ValidationResult,
  ValidationWarning,
  PatientDataConflict,
} from '../types/deviceImport';
import { extractPatientDataFromFile, detectPatientDataConflicts } from './deviceDataExtraction';

// Patient type for validation (minimal interface)
interface PatientForValidation {
  id: number;
  name?: string;
  species?: string;
  microchipId?: string;
}

// 15-digit ISO, 9-digit legacy, or 10/12-char hex reads; a name never fits
const CHIP_PATTERN = /^(\d{9}|\d{15}|[0-9A-Fa-f]{10}|[0-9A-Fa-f]{12})$/;

function looksLikeChip(identifier?: string): identifier is string {
  return !!identifier && CHIP_PATTERN.test(identifier.trim()) && /\d/.test(identifier);
}

/**
 * Create an empty validation result
 */
function createEmptyResult(): ValidationResult {
  return {
    warnings: [],
    errors: [],
    isValid: true,
  };
}

/**
 * Validate selected patient against device file data
 * Returns warnings if there are mismatches
 */
export function validatePatientSelection(
  selectedPatient: PatientForValidation | null,
  files: PendingDeviceFile[]
): ValidationResult {
  const result = createEmptyResult();

  // Error: No patient selected
  if (!selectedPatient) {
    result.errors.push({
      type: 'no_patient_selected',
      message: 'Please select a patient',
      details: {},
    });
    result.isValid = false;
    return result;
  }

  // Error: No files
  if (files.length === 0) {
    result.errors.push({
      type: 'no_files_selected',
      message: 'No device files to upload',
      details: {},
    });
    result.isValid = false;
    return result;
  }

  // Check each file for patient name mismatch
  for (const file of files) {
    const extracted = extractPatientDataFromFile(file);
    const identifier = file.patientIdentifier?.trim();
    const chipConfirmed = !!identifier && identifier === selectedPatient.microchipId?.trim();

    if (!chipConfirmed && looksLikeChip(identifier)) {
      result.warnings.push({
        type: 'patient_id_mismatch',
        message: `File "${file.fileName}" has microchip "${identifier}" but selected patient has "${selectedPatient.microchipId ?? ''}"`,
        details: {
          fileName: file.fileName,
          fileIdentifier: identifier,
          selectedMicrochipId: selectedPatient.microchipId,
        },
        severity: 'high',
      });
    }

    // Warning: Patient name mismatch
    if (
      !chipConfirmed &&
      extracted.name &&
      extracted.name.toLowerCase() !== (selectedPatient.name ?? '').toLowerCase()
    ) {
      result.warnings.push({
        type: 'patient_name_mismatch',
        message: `File "${file.fileName}" has patient name "${extracted.name}" but selected patient is "${selectedPatient.name}"`,
        details: {
          fileName: file.fileName,
          filePatientName: extracted.name,
          selectedPatientName: selectedPatient.name,
        },
        severity: 'medium',
      });
    }

    // Warning: Species mismatch
    if (extracted.species && selectedPatient.species &&
        extracted.species.toLowerCase() !== selectedPatient.species.toLowerCase()) {
      result.warnings.push({
        type: 'species_mismatch',
        message: `File "${file.fileName}" indicates species "${extracted.species}" but selected patient is "${selectedPatient.species}"`,
        details: {
          fileName: file.fileName,
          fileSpecies: extracted.species,
          selectedSpecies: selectedPatient.species,
        },
        severity: 'high',
      });
    }
  }

  return result;
}

export type MatchStrength = 'chip' | 'name' | 'chip_ambiguous' | 'name_ambiguous' | 'manual' | 'none';

/**
 * How strongly the machine's patient ID backs the picked patient
 */
export function getMatchStrength(
  files: PendingDeviceFile[],
  picked: PatientForValidation | null
): MatchStrength {
  const file = files.find((f) => f.patientIdentifier);
  if (!file) return picked ? 'manual' : 'none';
  if (file.matchAmbiguous && file.matchMethod === 'microchip') return 'chip_ambiguous';
  if (!picked) return file.matchAmbiguous ? 'name_ambiguous' : 'none';
  if (picked.microchipId && picked.microchipId.trim() === file.patientIdentifier?.trim()) return 'chip';
  if (file.patientId === picked.id && file.matchMethod === 'microchip') return 'chip';
  if (file.patientId === picked.id && file.matchMethod === 'name') return 'name';
  return 'manual';
}

/**
 * Validate consistency across multiple device files
 * Returns warnings if files have conflicting patient data
 */
export function validateFileConsistency(files: PendingDeviceFile[]): ValidationResult {
  const result = createEmptyResult();

  if (files.length <= 1) {
    return result;
  }

  const conflicts = detectPatientDataConflicts(files);

  for (const conflict of conflicts) {
    const warningType = conflict.field === 'name'
      ? 'multi_file_name_conflict'
      : conflict.field === 'species'
        ? 'multi_file_species_conflict'
        : 'multi_file_name_conflict'; // fallback

    result.warnings.push({
      type: warningType as ValidationWarning['type'],
      message: `Files have different ${conflict.field} values: ${conflict.values.map(v => `"${v.value}"`).join(', ')}`,
      details: {
        field: conflict.field,
        conflicts: conflict.values,
      },
      severity: conflict.field === 'name' ? 'medium' : 'low',
    });
  }

  return result;
}

/**
 * Run all validations and combine results
 */
export function validateAll(
  selectedPatient: PatientForValidation | null,
  files: PendingDeviceFile[]
): ValidationResult {
  const patientResult = validatePatientSelection(selectedPatient, files);
  const consistencyResult = validateFileConsistency(files);

  return {
    warnings: [...patientResult.warnings, ...consistencyResult.warnings],
    errors: [...patientResult.errors, ...consistencyResult.errors],
    isValid: patientResult.isValid && consistencyResult.isValid,
  };
}

/**
 * Convert PatientDataConflict to ValidationWarning (for future use)
 */
export function conflictToWarning(conflict: PatientDataConflict): ValidationWarning {
  return {
    type: 'multi_file_name_conflict',
    message: `Conflicting ${conflict.field} values across files`,
    details: {
      field: conflict.field,
      values: conflict.values,
    },
    severity: 'medium',
  };
}
