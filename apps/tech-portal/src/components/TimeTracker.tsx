import React, { useState } from 'react';
import '../style.css';
import { JobStatus } from '../domain/JobStatus';

interface TimeTrackerProps {
  jobId: string;
  onStatusChange?: (status: JobStatus) => void;
}

export const TimeTracker: React.FC<TimeTrackerProps> = ({ jobId, onStatusChange }) => {
  const [actionLoading, setActionLoading] = useState<'in' | 'out' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clockIn = async () => {
    setActionLoading('in');
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/clock-in`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clock in');
      onStatusChange?.(JobStatus.ON_SITE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const clockOut = async () => {
    setActionLoading('out');
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/clock-out`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clock out');
      onStatusChange?.(JobStatus.COMPLETED);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="time-tracker-container">
      <h3 className="time-tracker-title">Time Tracker</h3>
      {error && (
        <div role="alert" aria-live="assertive" className="time-tracker-alert">
          {error}
        </div>
      )}
      <div className="time-tracker-actions">
        <button
          onClick={clockIn}
          disabled={actionLoading !== null}
          aria-busy={actionLoading === 'in'}
          className="btn-clock-in"
        >
          {actionLoading === 'in' ? 'Clocking In...' : 'Clock In'}
        </button>
        <button
          onClick={clockOut}
          disabled={actionLoading !== null}
          aria-busy={actionLoading === 'out'}
          className="btn-clock-out"
        >
          {actionLoading === 'out' ? 'Clocking Out...' : 'Clock Out'}
        </button>
      </div>
    </div>
  );
};
