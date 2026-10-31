import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach, describe } from 'vitest';
import { TimeTracker } from '../TimeTracker';
import { JobStatus } from '../../domain/JobStatus';

describe('TimeTracker Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('renders TimeTracker with Clock In and Clock Out buttons', () => {
    render(<TimeTracker jobId="job-123" />);
    expect(screen.getByText('Time Tracker')).toBeInTheDocument();
    expect(screen.getByText('Clock In')).toBeInTheDocument();
    expect(screen.getByText('Clock Out')).toBeInTheDocument();
  });

  test('handles clock in successfully and emits JobStatus.ON_SITE', async () => {
    const onStatusChange = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    } as any);

    render(<TimeTracker jobId="job-123" onStatusChange={onStatusChange} />);
    const clockInBtn = screen.getByText('Clock In');
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(JobStatus.ON_SITE);
    });
  });

  test('handles clock out successfully and emits JobStatus.COMPLETED', async () => {
    const onStatusChange = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    } as any);

    render(<TimeTracker jobId="job-123" onStatusChange={onStatusChange} />);
    const clockOutBtn = screen.getByText('Clock Out');
    fireEvent.click(clockOutBtn);

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(JobStatus.COMPLETED);
    });
  });

  test('displays error alert when clock in fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    render(<TimeTracker jobId="job-123" />);
    const clockInBtn = screen.getByText('Clock In');
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to clock in')).toBeInTheDocument();
    });
  });
});
