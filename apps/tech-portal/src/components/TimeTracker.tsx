import React, { useState } from 'react';

interface TimeTrackerProps {
  jobId: string;
  onStatusChange?: (status: string) => void;
}

export const TimeTracker: React.FC<TimeTrackerProps> = ({ jobId, onStatusChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clockIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}/clock-in`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clock in');
      onStatusChange?.('On Site');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const clockOut = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/api/jobs/${jobId}/clock-out`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clock out');
      onStatusChange?.('Completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">Time Tracker</h3>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <div className="flex gap-2">
        <button
          onClick={clockIn}
          disabled={loading}
          className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 transition-colors"
        >
          Clock In
        </button>
        <button
          onClick={clockOut}
          disabled={loading}
          className="bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition-colors"
        >
          Clock Out
        </button>
      </div>
    </div>
  );
};
