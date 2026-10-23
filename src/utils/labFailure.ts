type T = (key: string, options?: Record<string, unknown>) => string;

/** Why a lab result could not be read, in the app language; `detail` keeps the raw cause for support. */
export function labFailureText(error: string | null | undefined, t: T): { text: string; detail: string } | null {
  if (!error) return null;
  const cut = /^Result stopped after (\d+) bytes/.exec(error);
  if (cut) return { text: t('devices:inbox.failure.cutOff', { bytes: Number(cut[1]) }), detail: error };
  return { text: t('devices:inbox.failure.unreadable'), detail: error };
}
