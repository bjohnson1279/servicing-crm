import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DailyRoute } from './components/DailyRoute';
import { JobDetail } from './components/JobDetail';
import { ChemicalLog } from './components/ChemicalLog';
import { SignatureCapture } from './components/SignatureCapture';
import './offlineQueue';

function App() {
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: number;
    const evtSource = new EventSource('http://localhost:8000/api/events');
    evtSource.addEventListener('job_assigned', (e) => {
      setNotification('New job assigned!');
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setNotification(null), 5000); // Auto-hide after 5s
    });
    return () => {
      clearTimeout(timeoutId);
      evtSource.close();
    };
  }, []);

  return (
    <Router>
      <div style={{ padding: '20px', fontFamily: 'sans-serif', position: 'relative' }}>
        {notification && (
          <div
            role="status"
            aria-live="polite"
            className="toast-notification"
          >
            <span>{notification}</span>
            <button
              onClick={() => setNotification(null)}
              aria-label="Dismiss notification"
              className="toast-close"
            >
              ✕
            </button>
          </div>
        )}
        <h1>Tech Portal</h1>
        <Routes>
          <Route path="/" element={<DailyRoute />} />
          <Route path="/job/:id" element={<JobDetail />} />
          <Route path="/job/:id/chemicals" element={<ChemicalLog />} />
          <Route path="/job/:id/signature" element={<SignatureCapture />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
