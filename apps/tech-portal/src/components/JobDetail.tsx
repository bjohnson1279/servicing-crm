import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TimeTracker } from './TimeTracker';

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
        <button
          onClick={advanceStatus}
          aria-label={`Mark job status as ${status === 'Available' ? 'En Route' : status === 'En Route' ? 'On Site' : 'Completed'}`}
          className="bg-blue-500 text-white px-4 py-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 hover:bg-blue-600 transition-colors"
        >
          Mark as {status === 'Available' ? 'En Route' : status === 'En Route' ? 'On Site' : 'Completed'}
        </button>
      )}

      {status === 'En Route' || status === 'On Site' ? (
        <TimeTracker jobId={id || ''} onStatusChange={(s) => setStatus(s as JobStatus)} />
      ) : null}

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          to={`/job/${id}/chemicals`}
          className="text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 rounded px-1"
        >
          Chemical Log
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          to={`/job/${id}/signature`}
          className="text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 rounded px-1"
        >
          Capture Signature
        </Link>
      </div>
      <div style={{ marginTop: '20px' }}>
        <Link
          to="/"
          className="text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 rounded px-1"
        >
          Back to Route
        </Link>
      </div>
    </div>
  );
};
