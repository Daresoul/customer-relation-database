/**
 * Main App component with React Router setup and Ant Design theme
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import { MainPage, PatientDetailPage, OwnerDetailPage } from './pages';
import { MainDashboard } from './pages/MainDashboard';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewProvider } from './contexts';
import { darkTheme } from './config/theme.config';

// Import Ant Design styles
import './styles/antd.css';

// Import existing styles (these will be gradually replaced)
import './styles/globals.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/view-switching.css';
import './styles/household-search.css';

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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ViewProvider>
          <AntApp>
            <Router>
              <div className="App">
                <Routes>
                  <Route path="/" element={<MainDashboard />} />
                  <Route path="/old" element={<MainPage />} />
                  <Route path="/patients/:id" element={<PatientDetailPage />} />
                  <Route path="/owners/:id" element={<OwnerDetailPage />} />
                </Routes>
              </div>
            </Router>
          </AntApp>
        </ViewProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;