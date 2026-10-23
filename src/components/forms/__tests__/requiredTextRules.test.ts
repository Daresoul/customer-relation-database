/**
 * forms #8: antd's `required` accepts "   ", so a name made of spaces was
 * saved. Every required text field also needs `whitespace: true`.
 * (Record modal and appointment fields are covered elsewhere.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEXT_FIELDS: Record<string, string[]> = {
  'components/forms/HouseholdForm.tsx': ['name="lastName"', "name={[name, 'firstName']}", "name={[name, 'lastName']}"],
  'components/forms/fieldGroups/ContactFieldGroup.tsx': ["name={fieldName('firstName')}", "name={fieldName('lastName')}"],
  'components/forms/fieldGroups/PatientFieldGroup.tsx': ['name="name"'],
  'components/CreateSpeciesModal/CreateSpeciesModal.tsx': ['name="name"'],
  'components/forms/CreateHouseholdInline.tsx': ['name="householdName"'],
  'components/CreateBreedModal/CreateBreedModal.tsx': ['name="name"'],
  'pages/Settings/components/DeviceInputSettings.tsx': ['name="name"', 'name="watch_directory"', 'name="tcp_host"'],
  'pages/Settings/components/ClinicSettings.tsx': ['name="name"'],
  'pages/Settings/components/RoomsSettings.tsx': ['name="name"'],
  'pages/Settings/components/SpeciesSettings.tsx': ['name="name"'],
  'pages/Settings/components/DiagnosesSettings.tsx': ['name="name"'],
  'pages/Settings/components/LineItemsSettings.tsx': ['name="name"'],
  'pages/Settings/components/RecordTemplatesSettings.tsx': ['name="title"', 'name="description"'],
  'pages/HouseholdDetail/PeopleSection/AddPersonModal.tsx': ['name="firstName"', 'name="lastName"', "name={[name, 'contactValue']}"],
  'pages/HouseholdDetail/PeopleSection/PersonCard.tsx': ['name="firstName"', 'name="lastName"', "name={[name, 'contactValue']}"],
  'pages/Settings/components/ManagedScannersSettings.tsx': ['name="name"'],
};

/** The `required: true` lines that follow one of `names` within 8 lines. */
function requiredRules(source: string, names: string[]): string[] {
  const lines = source.split('\n');
  return lines.filter((line, i) => {
    if (!line.includes('required: true')) return false;
    const window = lines.slice(Math.max(0, i - 8), i + 1).reverse();
    const nameLine = window.find((l) => /name=/.test(l));
    return !!nameLine && names.some((n) => nameLine.includes(n));
  });
}

describe('required text fields refuse blanks', () => {
  it.each(Object.entries(TEXT_FIELDS))('%s', (file, names) => {
    const source = readFileSync(resolve(__dirname, '../../..', file), 'utf8');
    const rules = requiredRules(source, names);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toContain('whitespace: true');
  });
});
