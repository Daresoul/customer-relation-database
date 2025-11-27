import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './i18n'; // Initialize i18n
import { attachConsole } from 'tauri-plugin-log-api';

// Attach console to forward JavaScript logs to Tauri logger
// This will forward console.log/info/warn/error to the Tauri logging system
attachConsole();

const root = document.getElementById('root')!;

// Disable StrictMode to prevent duplicate event listeners for Tauri events
// StrictMode intentionally double-invokes effects, which causes issues with
// Tauri's event system where listeners can't be easily deduplicated
ReactDOM.createRoot(root).render(<App />);
