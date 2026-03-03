/**
 * Field Groups - Reusable form field groupings
 *
 * These components extract common form field patterns used across
 * multiple forms for consistency and reduced code duplication.
 */

export { PatientFieldGroup } from './PatientFieldGroup';
export type { PatientFieldGroupProps, Species, Breed } from './PatientFieldGroup';

export { MedicalRecordFieldGroup } from './MedicalRecordFieldGroup';
export type {
  MedicalRecordFieldGroupProps,
  RecordType,
  Currency,
  RecordTemplate,
} from './MedicalRecordFieldGroup';

export { ContactFieldGroup } from './ContactFieldGroup';
export type { ContactFieldGroupProps, ContactType } from './ContactFieldGroup';
