/**
 * Main App component with React Router setup and Ant Design theme
 */

import { Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { useLabInboxLiveUpdates } from './hooks/useLabInbox';
import { invoke, logEvent } from '@/services/invoke';
import { createQueryClient } from './utils/queryClient';
import { applyAutostartDefault } from './utils/autostart';

// Import global styles
import './styles/globals.css';
import styles from './App.module.css';

// One retry; failed queries go to the log.
const queryClient = createQueryClient(logEvent);

// Component to listen for device data events
function DeviceDataHandler() {
  useDeviceDataListener();
  useDeviceEvents();
  useLabInboxLiveUpdates();
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

  useEffect(() => {
    applyAutostartDefault(invoke);
  }, []);

  return (
    <ConfigProvider locale={locale}>
      <ThemeProvider>
        <ViewProvider>
          <DeviceImportProvider>
            <AntApp notification={{ maxCount: 3, placement: 'bottomRight' }}>
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
