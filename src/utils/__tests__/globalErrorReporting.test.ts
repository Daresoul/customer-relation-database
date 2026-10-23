import { describe, it, expect, vi, afterEach } from 'vitest';
import { installGlobalErrorReporting } from '../globalErrorReporting';

// lifecycle.md #6: errors outside React render (event handlers, timers,
// promises nobody awaits) went nowhere in release builds.
describe('global error reporting', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it('reports an uncaught error to the log', () => {
    const report = vi.fn();
    uninstall = installGlobalErrorReporting(window, report);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new Error('boom') }));

    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      subsystem: 'webview.uncaught',
      message: 'boom',
    }));
  });

  it('reports a promise rejection nobody handled', () => {
    const report = vi.fn();
    uninstall = installGlobalErrorReporting(window, report);

    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('lost write');
    window.dispatchEvent(event);

    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: 'webview.unhandled_rejection',
      message: 'lost write',
    }));
  });

  it('keeps a long message short', () => {
    const report = vi.fn();
    uninstall = installGlobalErrorReporting(window, report);

    window.dispatchEvent(new ErrorEvent('error', { message: 'x'.repeat(5000) }));

    expect(report.mock.calls[0][0].message.length).toBeLessThanOrEqual(1000);
  });
});
