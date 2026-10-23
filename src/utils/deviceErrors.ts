import { extractErrorMessage } from './errors';

/**
 * The backend refuses an enabled serial machine on a port another enabled
 * machine uses, with `port_in_use:<that machine's name>`. Returns that name,
 * or null for any other error.
 */
export function portInUseBy(error: unknown): string | null {
  if (error == null) return null;
  const message = extractErrorMessage(error);
  const match = /port_in_use:(.*)$/s.exec(message);
  return match ? match[1].trim() : null;
}
