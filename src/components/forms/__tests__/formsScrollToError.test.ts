/**
 * forms #14: no form moved to the first error, so in a long form the error
 * could sit off screen and Save looked like it did nothing.
 * (Record modal and appointment forms are covered elsewhere.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES = [
  'components/forms/HouseholdForm.tsx',
  'components/forms/CreateHouseholdInline.tsx',
  'components/forms/PatientFormWithOwner.tsx',
  'components/CreateSpeciesModal/CreateSpeciesModal.tsx',
  'components/CreateBreedModal/CreateBreedModal.tsx',
  'pages/Settings/SettingsLayout.tsx',
  'pages/Settings/components/ClinicSettings.tsx',
  'pages/Settings/components/DeviceInputSettings.tsx',
  'pages/Settings/components/DiagnosesSettings.tsx',
  'pages/Settings/components/LineItemsSettings.tsx',
  'pages/Settings/components/ManagedScannersSettings.tsx',
  'pages/Settings/components/RecordTemplatesSettings.tsx',
  'pages/Settings/components/RoomsSettings.tsx',
  'pages/Settings/components/SpeciesSettings.tsx',
  'pages/HouseholdDetail/PeopleSection/AddPersonModal.tsx',
  'pages/HouseholdDetail/PeopleSection/PersonCard.tsx',
];

/** The opening `<Form ...>` tags of a file (not Form.Item / Form.List). */
function formTags(source: string): string[] {
  return [...source.matchAll(/<Form(?:<\w+>)?(?=[\s>])[^>]*?>/gs)].map((m) => m[0]);
}

describe('forms move to the first error', () => {
  it.each(FILES)('%s', (file) => {
    const tags = formTags(readFileSync(resolve(__dirname, '../../..', file), 'utf8'));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain('scrollToFirstError');
  });
});
