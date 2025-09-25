/**
 * Main App component with React Router setup and Ant Design theme
 */

import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, Spin } from 'antd';
import { MainDashboard } from './pages/MainDashboard';
import { HouseholdDetail } from './pages/HouseholdDetail';
import { PatientDetail } from './pages/PatientDetail';
import { MedicalRecordDetailPage } from './pages/MedicalRecordDetail';
import Settings from './pages/Settings';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewProvider } from './contexts';
import { AppWrapper } from './components/AppWrapper';

// Import Ant Design styles
import './styles/antd.css';

// Import global styles
import './styles/globals.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

function App() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ViewProvider>
            <AntApp>
              <Router>
                <AppWrapper>
                  <Routes>
                    <Route path="/" element={<MainDashboard />} />
                    <Route path="/households/:id" element={<HouseholdDetail />} />
                    <Route path="/patients/:id" element={<PatientDetail />} />
                    <Route path="/medical-records/:id" element={<MedicalRecordDetailPage />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </AppWrapper>
              </Router>
            </AntApp>
          </ViewProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Suspense>
  );
}

export default App;
