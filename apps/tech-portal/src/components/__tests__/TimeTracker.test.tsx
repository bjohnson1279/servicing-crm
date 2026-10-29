import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import { TimeTracker } from '../TimeTracker';

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

  test('handles clock in successfully', async () => {
    const onStatusChange = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    });

    render(<TimeTracker jobId="job-123" onStatusChange={onStatusChange} />);
    const clockInBtn = screen.getByText('Clock In');
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('On Site');
    });
  });

  test('displays error alert when clock in fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<TimeTracker jobId="job-123" />);
    const clockInBtn = screen.getByText('Clock In');
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to clock in')).toBeInTheDocument();
    });
  });
});
