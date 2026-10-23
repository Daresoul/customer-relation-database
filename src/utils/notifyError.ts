import { getUserFriendlyMessage, type TFunction } from './errors';

/** A translated text for any error; never the raw backend string. */
export function errorText(error: unknown, t: TFunction): string {
  return getUserFriendlyMessage(error, t);
}

interface ErrorNotifier {
  error: (config: { message: string; description: string; placement?: 'bottomRight' }) => void;
}

/** One error notification: `title` says what failed, the text says why. */
export function notifyError(notification: ErrorNotifier, title: string, error: unknown, t: TFunction): void {
  notification.error({ message: title, description: errorText(error, t), placement: 'bottomRight' });
}
