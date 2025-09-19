/**
 * Main App component with React Router setup
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainPage, PatientDetailPage, OwnerDetailPage } from './pages';
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
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/patients/:id" element={<PatientDetailPage />} />
            <Route path="/owners/:id" element={<OwnerDetailPage />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;