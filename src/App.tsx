/**
 * Main App component with React Router setup
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MainPage, PatientDetailPage, OwnerDetailPage } from './pages';
import './styles/globals.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/view-switching.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/owners/:id" element={<OwnerDetailPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;