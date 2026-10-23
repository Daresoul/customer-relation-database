import { extractErrorMessage, type TFunction } from './errors';
import { errorText } from './notifyError';

// Backend backup errors carry the OS text (Windows and Unix wording, and the
// os error number) after a step name such as "VACUUM INTO failed:".
const CAUSES: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /disk is full|no space left|not enough space|os error (28|112)\b/i, key: 'diskFull' },
  { pattern: /permission denied|access is denied|os error (5|13)\b/i, key: 'permissionDenied' },
  { pattern: /database is locked|database table is locked/i, key: 'databaseLocked' },
  {
    pattern: /directory does not exist|not a directory|no such file or directory|cannot find the path|os error (2|3)\b/i,
    key: 'folderMissing',
  },
];

/** A translated reason for a failed backup. */
export function backupErrorText(error: unknown, t: TFunction): string {
  const raw = extractErrorMessage(error);
  const cause = CAUSES.find((c) => c.pattern.test(raw));
  return cause ? t(`settings:backups.errors.${cause.key}`) : errorText(error, t);
}
