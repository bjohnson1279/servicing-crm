import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './offlineQueue';
import { syncCallbackOutcomes } from './callbackOfflineQueue';

// ⚡ Bolt Optimization: Lazy load route components to reduce initial bundle size,
// specifically delaying the loading of heavy dependencies like react-leaflet and react-signature-canvas
const DailyRoute = lazy(() => import('./components/DailyRoute').then(m => ({ default: m.DailyRoute })));
const JobDetail = lazy(() => import('./components/JobDetail').then(m => ({ default: m.JobDetail })));
const ChemicalLog = lazy(() => import('./components/ChemicalLog').then(m => ({ default: m.ChemicalLog })));
const SignatureCapture = lazy(() => import('./components/SignatureCapture').then(m => ({ default: m.SignatureCapture })));

function App() {
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    void syncCallbackOutcomes();
    const callbackSync = (event: Event) => setNotification((event as CustomEvent<string>).detail);
    window.addEventListener('callback_sync', callbackSync);
    let timeoutId: number;
    const evtSource = new EventSource('http://localhost:8000/api/events');
    evtSource.addEventListener('job_assigned', (e) => {
      setNotification('New job assigned!');
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setNotification(null), 5000); // Auto-hide after 5s
    });
    return () => {
      window.removeEventListener('callback_sync', callbackSync);
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
        <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<DailyRoute />} />
            <Route path="/job/:id" element={<JobDetail />} />
            <Route path="/job/:id/chemicals" element={<ChemicalLog />} />
            <Route path="/job/:id/signature" element={<SignatureCapture />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
