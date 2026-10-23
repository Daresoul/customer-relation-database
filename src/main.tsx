import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './i18n'; // Initialize i18n
import { attachConsole } from 'tauri-plugin-log-api';
import { RootErrorBoundary } from './components/common/ErrorBoundary';
import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';
import { installGlobalErrorReporting } from './utils/globalErrorReporting';

// Attach console to forward JavaScript logs to Tauri logger
// This will forward console.log/info/warn/error to the Tauri logging system
attachConsole();

// Errors outside React render (handlers, timers, unawaited promises). Raw
// Tauri invoke: the wrapped one reports its own failures to log_event.
installGlobalErrorReporting(window, (input) => {
  tauriInvoke('log_event', { input }).catch(() => {});
});

const root = document.getElementById('root')!;

// Disable StrictMode to prevent duplicate event listeners for Tauri events
// StrictMode intentionally double-invokes effects, which causes issues with
// Tauri's event system where listeners can't be easily deduplicated
ReactDOM.createRoot(root).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
