import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TimeTracker } from './TimeTracker';
import CallbackWorkspace from './callbacks/CallbackWorkspace';
import { queueCallbackOutcome } from '../callbackOfflineQueue';
import { CallbackDrafts } from './CallbackDrafts';
import InspectionWorkspace from './inspections/InspectionWorkspace';
import DeviceWorkspace from './devices/DeviceWorkspace';
import CatalogWorkspace from './catalog/CatalogWorkspace';
import { LazyDetails } from './LazyDetails';
import { JobStatus } from '../domain/JobStatus';

export const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [jobStatus, setJobStatus] = useState<JobStatus>(JobStatus.AVAILABLE);

  const advanceStatus = () => {
    if (jobStatus.canAdvance()) {
      setJobStatus(jobStatus.nextStatus());
    }
  };

  const nextStatusLabel = jobStatus.getNextStatusLabel();

  return (
    <div>
      <h2>Job Detail - {id}</h2>
      <LazyDetails summary="Inspection findings"><InspectionWorkspace mode="technician" jobId={id} /></LazyDetails>
      <LazyDetails summary="Property devices"><DeviceWorkspace mode="technician" jobId={id} /></LazyDetails>
      <LazyDetails summary="Reviewed product references"><CatalogWorkspace mode="technician" jobId={id} /></LazyDetails>
      <LazyDetails summary="Callback context and outcome"><CallbackWorkspace mode="technician" jobId={id} queueOutcome={queueCallbackOutcome} /></LazyDetails>
      <CallbackDrafts jobId={id || ''} />
      <p>Current Status: <strong>{jobStatus.toString()}</strong></p>
      
      {!jobStatus.isTerminal() && nextStatusLabel && (
        <button
          onClick={advanceStatus}
          aria-label={`Mark job status as ${nextStatusLabel}`}
          className="bg-blue-500 text-white px-4 py-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 hover:bg-blue-600 transition-colors"
        >
          Mark as {nextStatusLabel}
        </button>
      )}

      {jobStatus.equals('En Route') || jobStatus.equals('On Site') ? (
        <TimeTracker jobId={id || ''} onStatusChange={(s) => setJobStatus(new JobStatus(s))} />
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
