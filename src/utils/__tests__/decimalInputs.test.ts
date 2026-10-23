import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Every money, weight and quantity input reads a decimal comma through the
// shared parser. A new InputNumber in these files without it fails here.
const FILES = [
  'src/components/forms/fieldGroups/LineItemsFieldGroup.tsx',
  'src/components/forms/fieldGroups/PatientFieldGroup.tsx',
  'src/components/DeviceImportModal/CreatePatientSection.tsx',
  'src/pages/PatientDetail/chart/AddWeightModal.tsx',
  'src/components/MedicalRecordModal/MedicalRecordForm.tsx',
  'src/pages/Settings/components/LineItemsSettings.tsx',
];

function inputNumberTags(source: string): string[] {
  const tags: string[] = [];
  let at = source.indexOf('<InputNumber');
  while (at >= 0) {
    const end = source.indexOf('/>', at);
    tags.push(source.slice(at, end));
    at = source.indexOf('<InputNumber', end);
  }
  return tags;
}

describe('number inputs accept a decimal comma', () => {
  it.each(FILES)('%s', (file) => {
    const tags = inputNumberTags(readFileSync(resolve(process.cwd(), file), 'utf8'));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag, tag).toMatch(/localeNumberParser|localeMoneyParser/);
    }
  });
});
