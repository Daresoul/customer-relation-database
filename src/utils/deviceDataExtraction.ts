/**
 * Utilities for extracting patient data from device files
 */

import type { PendingDeviceFile } from '../contexts/DeviceImportContext';
import type { ExtractedPatientData, PatientDataConflict } from '../types/deviceImport';

/**
 * Extract patient data from a single device file
 */
export function extractPatientDataFromFile(file: PendingDeviceFile): ExtractedPatientData {
  const testResults = file.testResults || {};

  return {
    name: extractName(testResults),
    species: extractSpecies(testResults),
    dateOfBirth: extractDateOfBirth(testResults),
    gender: extractGender(testResults),
    sources: [file.fileName],
  };
}

/**
 * Extract and aggregate patient data from multiple device files
 * When multiple files have the same value, it's used. When they differ, the first non-empty value wins.
 */
export function aggregatePatientData(files: PendingDeviceFile[]): ExtractedPatientData {
  if (files.length === 0) {
    return { sources: [] };
  }

  if (files.length === 1) {
    return extractPatientDataFromFile(files[0]);
  }

  const allExtracted = files.map(extractPatientDataFromFile);
  const sources = files.map(f => f.fileName);

  return {
    name: findFirstValue(allExtracted, 'name'),
    species: findFirstValue(allExtracted, 'species'),
    dateOfBirth: findFirstValue(allExtracted, 'dateOfBirth'),
    gender: findFirstValue(allExtracted, 'gender'),
    sources,
  };
}

/**
 * Detect conflicts in patient data across multiple files
 */
export function detectPatientDataConflicts(files: PendingDeviceFile[]): PatientDataConflict[] {
  if (files.length <= 1) {
    return [];
  }

  const conflicts: PatientDataConflict[] = [];
  const allExtracted = files.map(f => ({
    data: extractPatientDataFromFile(f),
    fileName: f.fileName,
  }));

  // Check each field for conflicts
  const fieldsToCheck: Array<keyof Omit<ExtractedPatientData, 'sources'>> = [
    'name',
    'species',
    'dateOfBirth',
    'gender',
  ];

  for (const field of fieldsToCheck) {
    const valuesWithSources = allExtracted
      .filter(e => e.data[field] !== undefined && e.data[field] !== '')
      .map(e => ({
        value: String(e.data[field]),
        source: e.fileName,
      }));

    // Check if there are different values
    const uniqueValues = new Set(valuesWithSources.map(v => v.value));
    if (uniqueValues.size > 1) {
      conflicts.push({
        field,
        values: valuesWithSources,
      });
    }
  }

  return conflicts;
}

/**
 * Check if any patient data was extracted from files
 */
export function hasExtractedData(data: ExtractedPatientData): boolean {
  return !!(data.name || data.species || data.dateOfBirth || data.gender);
}

// --- Private helper functions ---

function extractName(testResults: Record<string, unknown>): string | undefined {
  // Try different possible field names
  // - patient_name: HL7 PID-6 (PointCare, Healvet)
  // - ID2: Exigo patient identifier
  const name = testResults.patient_name || testResults.patientName || testResults.name || testResults.ID2;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

function extractSpecies(testResults: Record<string, unknown>): string | undefined {
  // Try different possible field names
  // - species: HL7 PID-5 (PointCare, Healvet)
  // - APNA: Exigo application name (e.g., "DOG", "DOG (3p)", "CAT")
  const species = testResults.species || testResults.APNA;
  if (typeof species === 'string' && species.trim()) {
    // Normalize common variations
    // Handle Exigo format like "DOG (3p)" -> "DOG"
    const cleanedSpecies = species.trim().split('(')[0].trim();
    const normalized = cleanedSpecies.toLowerCase();
    if (normalized === 'dog' || normalized === 'canine') return 'Dog';
    if (normalized === 'cat' || normalized === 'feline') return 'Cat';
    // Return capitalized version for other species
    return cleanedSpecies.charAt(0).toUpperCase() + cleanedSpecies.slice(1).toLowerCase();
  }
  return undefined;
}

function extractDateOfBirth(testResults: Record<string, unknown>): string | undefined {
  // HL7 format: YYYYMMDDHHmmss or YYYYMMDD
  const dob = testResults.birth_date_alt || testResults.birthDate || testResults.dateOfBirth;

  if (typeof dob === 'string' && dob.trim()) {
    const cleaned = dob.trim();

    // Try to parse HL7 format (YYYYMMDDHHmmss or YYYYMMDD)
    if (/^\d{8,14}$/.test(cleaned)) {
      const year = cleaned.substring(0, 4);
      const month = cleaned.substring(4, 6);
      const day = cleaned.substring(6, 8);

      // Validate it's a reasonable date
      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);

      if (yearNum >= 1900 && yearNum <= 2100 &&
          monthNum >= 1 && monthNum <= 12 &&
          dayNum >= 1 && dayNum <= 31) {
        return `${year}-${month}-${day}`;
      }
    }

    // Try ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      return cleaned.substring(0, 10);
    }
  }

  return undefined;
}

function extractGender(testResults: Record<string, unknown>): ExtractedPatientData['gender'] {
  const gender = testResults.gender_alt || testResults.gender;

  if (typeof gender === 'string') {
    const normalized = gender.trim().toUpperCase();

    if (normalized === 'M' || normalized === 'MALE') return 'Male';
    if (normalized === 'F' || normalized === 'FEMALE') return 'Female';
    if (normalized === 'O' || normalized === 'U' || normalized === 'UNKNOWN' || normalized === 'OTHER') {
      return 'Unknown';
    }
  }

  return undefined;
}

function findFirstValue<K extends keyof Omit<ExtractedPatientData, 'sources'>>(
  extracted: ExtractedPatientData[],
  key: K
): ExtractedPatientData[K] {
  for (const data of extracted) {
    const value = data[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}
