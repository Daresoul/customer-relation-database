import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './styles/globals.css';
import './i18n'; // Initialize i18n
import { attachConsole } from 'tauri-plugin-log-api';

// Initialize Sentry for frontend error capture. Same DSN as the Rust side so
// errors from both sides land in one project. import.meta.env.MODE tags dev
// vs production so we can filter noisy dev events out in the dashboard.
Sentry.init({
  dsn: 'https://e563160f60072e45b88d783b3f153172@o4511411837861888.ingest.de.sentry.io/4511411842187344',
  environment: import.meta.env.MODE,
  sendDefaultPii: true,
});

// Attach console to forward JavaScript logs to Tauri logger
// This will forward console.log/info/warn/error to the Tauri logging system
attachConsole();

const root = document.getElementById('root')!;

// Disable StrictMode to prevent duplicate event listeners for Tauri events
// StrictMode intentionally double-invokes effects, which causes issues with
// Tauri's event system where listeners can't be easily deduplicated
ReactDOM.createRoot(root).render(
  <Sentry.ErrorBoundary fallback={<div style={{ padding: 24 }}>Something went wrong. The error has been reported.</div>}>
    <App />
  </Sentry.ErrorBoundary>
);
