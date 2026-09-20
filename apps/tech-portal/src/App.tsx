import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DailyRoute } from './components/DailyRoute';
import { JobDetail } from './components/JobDetail';
import { ChemicalLog } from './components/ChemicalLog';
import { SignatureCapture } from './components/SignatureCapture';
import './offlineQueue';

function App() {
  useEffect(() => {
    const evtSource = new EventSource('http://localhost:8000/api/events');
    evtSource.addEventListener('job_assigned', (e) => {
      alert('New job assigned!');
    });
    return () => evtSource.close();
  }, []);

  return (
    <Router>
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
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
