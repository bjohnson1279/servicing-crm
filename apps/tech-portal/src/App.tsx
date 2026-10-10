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
    const evtSource = new EventSource('http://localhost:8000/api/events');
    evtSource.addEventListener('job_assigned', (e) => {
      setNotification('New job assigned!');
      window.setTimeout(() => setNotification(null), 5000);
    });
    return () => evtSource.close();
  }, []);

  return (
    <Router>
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        {notification && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: '12px 16px',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #bae6fd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{notification}</span>
            <button
              onClick={() => setNotification(null)}
              aria-label="Dismiss notification"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0369a1',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '4px'
              }}
            >
              &times;
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
