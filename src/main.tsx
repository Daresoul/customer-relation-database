import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';
import App from './App';
import './styles/globals.css';
import './i18n'; // Initialize i18n
import { attachConsole } from 'tauri-plugin-log-api';

// Frontend errors are forwarded to the Rust-side `log_event` Tauri command,
// which emits a structured telemetry event through tauri-plugin-log. The
// log line lands in vet-clinic.log, the Loki shipper picks it up, and the
// error appears in Grafana alongside Rust-side events.
//
// We intentionally don't use the wrapped `invoke` from services/invoke.ts
// here because that wrapper also forwards to log_event on failure — using
// it from the error path would risk a feedback loop on the rare case where
// the command itself fails.
function reportError(
  level: 'error' | 'warn' | 'info',
  subsystem: string,
  message: string,
  extras: unknown,
): void {
  tauriInvoke('log_event', {
    input: { level, subsystem, message, extras },
  }).catch(() => {
    // log_event failing means Tauri IPC itself is broken — there's no
    // better channel to report it on. Swallow silently rather than
    // throwing into React's render path.
  });
}

// Custom error boundary replacing the old @sentry/react one. React requires
// a class component for componentDidCatch / getDerivedStateFromError.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportError(
      'error',
      'react.error_boundary',
      error.message ?? 'unknown error',
      {
        name: error.name ?? null,
        stack: error.stack ?? null,
        componentStack: errorInfo.componentStack ?? null,
      },
    );
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          Something went wrong. The error has been logged.
        </div>
      );
    }
    return this.props.children;
  }
}

// Attach console to forward JavaScript logs to Tauri logger
// This will forward console.log/info/warn/error to the Tauri logging system
attachConsole();

const root = document.getElementById('root')!;

// Disable StrictMode to prevent duplicate event listeners for Tauri events
// StrictMode intentionally double-invokes effects, which causes issues with
// Tauri's event system where listeners can't be easily deduplicated
ReactDOM.createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
