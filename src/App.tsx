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

  return (
    <ConfigProvider locale={locale}>
      <ThemeProvider>
        <ViewProvider>
          <DeviceImportProvider>
            <AntApp notification={{ maxCount: 1 }}>
              <DeviceDataHandler />
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
