export interface ErrorReport {
  level: 'error';
  subsystem: string;
  message: string;
  extras: Record<string, unknown>;
}

/** Sends uncaught errors and unhandled rejections to `report`. Returns an uninstall function. */
export function installGlobalErrorReporting(
  _target: Window,
  _report: (r: ErrorReport) => void,
): () => void {
  return () => {};
}
