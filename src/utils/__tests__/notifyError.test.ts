import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { errorText, notifyError } from '../notifyError';
import { backupErrorText } from '../backupErrors';

// Every key resolves to a marked text, so a raw backend string is easy to spot.
const t = (key: string) => `T(${key})`;

// app-shell #6, dashboard #18: 33 places showed `String(e)`, the raw backend
// error ("Error: database is locked"), to the clinic.
describe('errorText', () => {
  it('translates an error it recognises', () => {
    expect(errorText('database is locked', t)).toBe('T(errors:database.locked)');
  });

  it('shows a translated general message instead of an unknown raw error', () => {
    expect(errorText(new Error('sqlx::Error RowNotFound at src/x.rs:12'), t)).toBe('T(errors:generic.unexpected)');
  });

  it('says a name is taken in another case', () => {
    expect(errorText('A species with this name already exists', t)).toBe('T(errors:generic.nameTaken)');
    expect(errorText('A price list item with this name already exists', t)).toBe('T(errors:generic.nameTaken)');
  });
});

describe('notifyError', () => {
  it('opens one error notification with the title and the translated text', () => {
    const notification = { error: vi.fn() };
    notifyError(notification, 'Could not save', 'database is locked', t);
    expect(notification.error).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Could not save',
      description: 'T(errors:database.locked)',
    }));
  });
});

// settings.md #6: backup errors came straight from the backend
// ("VACUUM INTO failed: database or disk is full").
describe('backupErrorText', () => {
  it.each([
    ['Backup directory does not exist: E:\\Backups', 'folderMissing'],
    ['Create db dir: No such file or directory (os error 2)', 'folderMissing'],
    ['Files mirror failed: Access is denied. (os error 5)', 'permissionDenied'],
    ['Create files dir: Permission denied (os error 13)', 'permissionDenied'],
    ['VACUUM INTO failed: database or disk is full', 'diskFull'],
    ['Files mirror failed: There is not enough space on the disk. (os error 112)', 'diskFull'],
    ['VACUUM INTO failed: database is locked', 'databaseLocked'],
  ])('%s → %s', (raw, key) => {
    expect(backupErrorText(raw, t)).toBe(`T(settings:backups.errors.${key})`);
  });

  it('falls back to the general translated error', () => {
    expect(backupErrorText('Prune failed: weird', t)).toBe('T(errors:generic.unexpected)');
  });
});

describe('no raw errors on screen', () => {
  const files = [
    'components/RecentDeviceFiles.tsx',
    'components/forms/CreateHouseholdInline.tsx',
    'components/DeviceStatusBar/DeviceStatusBar.tsx',
    'components/DeviceStatusBar/DeviceDetailsDrawer.tsx',
    'components/DevTools/DevToolsDrawer.tsx',
    'components/LabInbox/MoveLabResultModal.tsx',
    'components/LabInbox/LabInboxList.tsx',
    'hooks/useDocumentStatusNotice.tsx',
    'pages/Settings/components/DeviceAlertSettings.tsx',
    'pages/Settings/components/DiagnosesSettings.tsx',
    'pages/Settings/components/BackupSettings.tsx',
    'pages/Settings/components/ManagedScannersSettings.tsx',
    'pages/PatientDetail/HouseholdSection.tsx',
    'services/api.integration.ts',
  ];

  it.each(files)('%s shows no String(e) or raw error.message', (file) => {
    const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
    expect(source).not.toMatch(/String\((e|err|error)\)/);
    expect(source).not.toMatch(/(e|err|error)(\?)?\.message \|\|/);
    expect(source).not.toMatch(/e instanceof Error \? e\.message/);
  });
});
