/**
 * Main App component with React Router setup and Ant Design theme
 */

import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, Spin, ConfigProvider } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/mk';
import 'dayjs/locale/en';
import enUS from 'antd/locale/en_US';
import mkMK from 'antd/locale/mk_MK';
import { MainDashboard } from './pages/MainDashboard';
import { HouseholdDetail } from './pages/HouseholdDetail';
import { PatientDetail } from './pages/PatientDetail';
import { MedicalRecordDetailPage } from './pages/MedicalRecordDetail';
import Settings from './pages/Settings';
import Appointments from './pages/Appointments/Appointments';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewProvider } from './contexts';
import { DeviceImportProvider } from './contexts/DeviceImportContext';
import { AppWrapper } from './components/AppWrapper';
import DeviceImportModal from './components/DeviceImportModal/DeviceImportModal';
import { useDeviceDataListener } from './hooks/useDeviceDataListener';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useDeviceImport } from './contexts/DeviceImportContext';
import { useViewContext } from './contexts';

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
  return null;
}

// Listen for wake-from-tray events to open UI appropriately
function WakeFromTrayHandler() {
  const { openModal } = useDeviceImport();
  const { setCurrentView } = useViewContext();
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen<any>('wake-from-tray', (event) => {
        const payload = event.payload || {};
        if (payload.cause === 'file') {
          // Ensure the import modal is visible
          openModal();
          // Navigate to main (normal page) and ensure patients view
          setCurrentView('animal');
          try { window.history.pushState({}, '', '/'); } catch {}
        }
        if (payload.cause === 'manual') {
          // Reset to default "new" state: patients view on main dashboard
          setCurrentView('animal');
          // Navigate to root without carrying prior state
          try {
            window.history.pushState({}, '', '/');
          } catch {}
        }
        if (payload.cause === 'scan' && payload.code) {
          // Navigate to main so dashboard handler can search
          setCurrentView('animal');
          try { window.history.pushState({}, '', '/'); } catch {}
        }
        // 'scan' is handled by page-level listeners and DeviceImport modal
        // 'manual' can be used to reset view if desired
      });
    };
    setup();
    return () => { if (unlisten) unlisten(); };
  }, [openModal, setCurrentView]);
  return null;
}

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
            <AntApp notification={{ maxCount: 1 }}>
              <DeviceDataHandler />
              <WakeFromTrayHandler />
              <DeviceImportModal />
              <Router>
                <AppWrapper>
                  <Routes>
                    <Route path="/" element={<MainDashboard />} />
                    <Route path="/households/:id" element={<HouseholdDetail />} />
                    <Route path="/patients/:id" element={<PatientDetail />} />
                    <Route path="/medical-records/:id" element={<MedicalRecordDetailPage />} />
                    <Route path="/appointments" element={<Appointments />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </AppWrapper>
              </Router>
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
