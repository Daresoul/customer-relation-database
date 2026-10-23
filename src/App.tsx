/**
 * Main App component with React Router setup and Ant Design theme
 */

import React, { Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, Spin, ConfigProvider } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/mk';
import 'dayjs/locale/en';
import enUS from 'antd/locale/en_US';
import mkMK from 'antd/locale/mk_MK';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewProvider } from './contexts';
import { DeviceImportProvider } from './contexts/DeviceImportContext';
import { useDeviceDataListener } from './hooks/useDeviceDataListener';
import { useDeviceEvents } from './hooks/useDeviceEvents';
import { appRoutes } from './layouts/routes';
import { invoke } from '@/services/invoke';

// Import global styles
import './styles/globals.css';
import styles from './App.module.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

// Component to listen for device data events
function DeviceDataHandler() {
  useDeviceDataListener();
  useDeviceEvents();
  return null;
}

// Data router: `useBlocker` (unsaved-changes guard) only works with one.
const router = createBrowserRouter(appRoutes);

// Inner component to use hooks for locale
function AppContent() {
  const { i18n } = useTranslation();
  const [locale, setLocale] = useState(i18n.language === 'mk' ? mkMK : enUS);

  useEffect(() => {
    // Update dayjs locale when language changes
    const currentLang = i18n.language;
    dayjs.locale(currentLang === 'mk' ? 'mk' : 'en');
    setLocale(currentLang === 'mk' ? mkMK : enUS);
  }, [i18n.language]);

  // Ensure autostart enabled (can be toggled from Settings later)
  useEffect(() => {
    const ensureAutostart = async () => {
      try {
        const enabled = await invoke<boolean>('plugin:autostart|is_enabled');
        if (!enabled) {
          await invoke('plugin:autostart|enable');
        }
      } catch (_) {
        // plugin may be unavailable in dev; ignore
      }
    };
    ensureAutostart();
  }, []);

  return (
    <ConfigProvider locale={locale}>
      <ThemeProvider>
        <ViewProvider>
          <DeviceImportProvider>
            <AntApp notification={{ maxCount: 1, placement: 'bottomRight' }}>
              <DeviceDataHandler />
              <RouterProvider router={router} />
            </AntApp>
          </DeviceImportProvider>
        </ViewProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
}

function App() {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}><Spin size="large" /></div>}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </Suspense>
  );
}

export default App;
