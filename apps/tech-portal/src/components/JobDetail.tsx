import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';

type JobStatus = 'Available' | 'En Route' | 'On Site' | 'Completed';

export const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<JobStatus>('Available');

  const advanceStatus = () => {
    if (status === 'Available') setStatus('En Route');
    else if (status === 'En Route') setStatus('On Site');
    else if (status === 'On Site') setStatus('Completed');
  };

  return (
    <div>
      <h2>Job Detail - {id}</h2>
      <p>Current Status: <strong>{status}</strong></p>
      
      {status !== 'Completed' && (
        <button onClick={advanceStatus}>
          Mark as {status === 'Available' ? 'En Route' : status === 'En Route' ? 'On Site' : 'Completed'}
        </button>
      )}

      <div style={{ marginTop: '20px' }}>
        <Link to={`/job/${id}/chemicals`}>Chemical Log</Link> |{' '}
        <Link to={`/job/${id}/signature`}>Capture Signature</Link>
      </div>
      <div style={{ marginTop: '20px' }}>
        <Link to="/">Back to Route</Link>
      </div>
    </div>
  );
};
