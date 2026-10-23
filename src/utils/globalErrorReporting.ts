export interface ErrorReport {
  level: 'error';
  subsystem: string;
  message: string;
  extras: Record<string, unknown>;
}

const MAX_MESSAGE = 1000;

function describe(value: unknown): { message: string; name: string | null; stack: string | null } {
  if (value instanceof Error) {
    return { message: value.message, name: value.name, stack: value.stack ?? null };
  }
  return { message: typeof value === 'string' ? value : String(value), name: null, stack: null };
}

/** Sends uncaught errors and unhandled rejections to `report`. Returns an uninstall function. */
export function installGlobalErrorReporting(
  target: Window,
  report: (r: ErrorReport) => void,
): () => void {
  const send = (subsystem: string, message: string, extras: Record<string, unknown>) => {
    try {
      report({ level: 'error', subsystem, message: (message || 'unknown error').slice(0, MAX_MESSAGE), extras });
    } catch {
      // reporting must never throw back into the page
    }
  };

  const onError = (event: ErrorEvent) => {
    const d = describe(event.error ?? event.message);
    send('webview.uncaught', event.message || d.message, {
      name: d.name,
      stack: d.stack,
      source: event.filename || null,
      line: event.lineno || null,
    });
  };
  const onRejection = (event: Event) => {
    const d = describe((event as PromiseRejectionEvent).reason);
    send('webview.unhandled_rejection', d.message, { name: d.name, stack: d.stack });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
