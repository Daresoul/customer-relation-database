import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './i18n'; // Initialize i18n

const root = document.getElementById('root')!;
const isDev = import.meta.env.DEV;
const RootTree = isDev ? (
  <React.StrictMode>
    <App />
  </React.StrictMode>
) : (
  <App />
);

ReactDOM.createRoot(root).render(RootTree);
