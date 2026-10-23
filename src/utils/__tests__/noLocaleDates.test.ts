/**
 * dates-time #8: these screens printed dates with the browser's locale
 * (1/31/2024, 10:00:00 AM) instead of the clinic's date format setting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES = [
  'components/RecentDeviceFiles.tsx',
  'components/PrintReportModal/PrintReportModal.tsx',
  'pages/Settings/UpdateSettings.tsx',
  'pages/Settings/components/BackupSettings.tsx',
  'pages/Settings/components/ManagedScannersSettings.tsx',
];

describe('dates follow the date format setting', () => {
  it.each(FILES)('%s', (file) => {
    const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
    expect(source).not.toMatch(/toLocale(Date|Time)?String\(/);
  });
});
