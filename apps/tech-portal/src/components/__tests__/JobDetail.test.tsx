import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { JobDetail } from '../JobDetail';
import { JobStatus } from '../../domain/JobStatus';

// Mock subcomponents
vi.mock('../TimeTracker', () => ({
  TimeTracker: ({ jobId, onStatusChange }: { jobId: string; onStatusChange?: (status: JobStatus) => void }) => (
    <div data-testid="time-tracker">
      <span>TimeTracker Mock - Job: {jobId}</span>
      <button
        onClick={() => onStatusChange?.(JobStatus.ON_SITE)}
        data-testid="mock-clock-in"
      >
        Trigger Clock In
      </button>
      <button
        onClick={() => onStatusChange?.(JobStatus.COMPLETED)}
        data-testid="mock-clock-out"
      >
        Trigger Clock Out
      </button>
    </div>
  ),
}));

vi.mock('../callbacks/CallbackWorkspace', () => ({
  default: ({ mode, jobId }: { mode: string; jobId?: string }) => (
    <div data-testid="callback-workspace">
      CallbackWorkspace Mock ({mode}, {jobId})
    </div>
  ),
}));

vi.mock('../CallbackDrafts', () => ({
  CallbackDrafts: ({ jobId }: { jobId: string }) => (
    <div data-testid="callback-drafts">CallbackDrafts Mock ({jobId})</div>
  ),
}));

vi.mock('../inspections/InspectionWorkspace', () => ({
  default: ({ mode, jobId }: { mode: string; jobId?: string }) => (
    <div data-testid="inspection-workspace">
      InspectionWorkspace Mock ({mode}, {jobId})
    </div>
  ),
}));

vi.mock('../devices/DeviceWorkspace', () => ({
  default: ({ mode, jobId }: { mode: string; jobId?: string }) => (
    <div data-testid="device-workspace">
      DeviceWorkspace Mock ({mode}, {jobId})
    </div>
  ),
}));

vi.mock('../catalog/CatalogWorkspace', () => ({
  default: ({ mode, jobId }: { mode: string; jobId?: string }) => (
    <div data-testid="catalog-workspace">
      CatalogWorkspace Mock ({mode}, {jobId})
    </div>
  ),
}));

describe('JobDetail Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithRoute = (initialEntry = '/job/job-abc-123') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/job/:id" element={<JobDetail />} />
          <Route path="/job" element={<JobDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('renders Job Detail with route parameter in header and navigation links', () => {
    renderWithRoute('/job/job-999');

    expect(screen.getByRole('heading', { level: 2, name: /Job Detail - job-999/i })).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();

    const chemicalLink = screen.getByRole('link', { name: /Chemical Log/i });
    expect(chemicalLink).toHaveAttribute('href', '/job/job-999/chemicals');

    const signatureLink = screen.getByRole('link', { name: /Capture Signature/i });
    expect(signatureLink).toHaveAttribute('href', '/job/job-999/signature');

    const backLink = screen.getByRole('link', { name: /Back to Route/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  test('handles missing or empty route parameter gracefully', () => {
    renderWithRoute('/job');

    expect(screen.getByRole('heading', { level: 2, name: /Job Detail -/i })).toBeInTheDocument();
    expect(screen.getByTestId('callback-drafts')).toHaveTextContent('CallbackDrafts Mock ()');

    const chemicalLink = screen.getByRole('link', { name: /Chemical Log/i });
    expect(chemicalLink).toHaveAttribute('href', '/job/undefined/chemicals');
  });

  test('advances through full lifecycle from Available -> En Route -> On Site -> Completed', () => {
    renderWithRoute('/job/job-lifecycle');

    // 1. Initial State: Available
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.queryByTestId('time-tracker')).not.toBeInTheDocument();

    const enRouteBtn = screen.getByRole('button', { name: /Mark job status as En Route/i });
    expect(enRouteBtn).toHaveTextContent('Mark as En Route');
    fireEvent.click(enRouteBtn);

    // 2. State: En Route
    expect(screen.getByText('En Route')).toBeInTheDocument();
    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();

    const onSiteBtn = screen.getByRole('button', { name: /Mark job status as On Site/i });
    expect(onSiteBtn).toHaveTextContent('Mark as On Site');
    fireEvent.click(onSiteBtn);

    // 3. State: On Site
    expect(screen.getByText('On Site')).toBeInTheDocument();
    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();

    const completedBtn = screen.getByRole('button', { name: /Mark job status as Completed/i });
    expect(completedBtn).toHaveTextContent('Mark as Completed');
    fireEvent.click(completedBtn);

    // 4. Terminal State: Completed
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Advance button must not exist when status is terminal
    expect(screen.queryByRole('button', { name: /Mark job status as/i })).not.toBeInTheDocument();
    // TimeTracker should not be rendered for Completed status
    expect(screen.queryByTestId('time-tracker')).not.toBeInTheDocument();
  });

  test('updates status and unmounts TimeTracker when TimeTracker triggers Completed', () => {
    renderWithRoute('/job/job-time-tracker');

    // Advance to En Route so TimeTracker is mounted
    const advanceBtn = screen.getByRole('button', { name: /Mark job status as En Route/i });
    fireEvent.click(advanceBtn);
    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();
    expect(screen.getByText('En Route')).toBeInTheDocument();

    // Trigger clock out directly from TimeTracker
    const clockOutBtn = screen.getByTestId('mock-clock-out');
    fireEvent.click(clockOutBtn);

    // Should transition to Completed and unmount TimeTracker
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByTestId('time-tracker')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark job status as/i })).not.toBeInTheDocument();
  });

  test('updates status from En Route to On Site when TimeTracker triggers Clock In', () => {
    renderWithRoute('/job/job-clock-in');

    // Advance to En Route
    fireEvent.click(screen.getByRole('button', { name: /Mark job status as En Route/i }));
    expect(screen.getByText('En Route')).toBeInTheDocument();

    // Trigger clock in from TimeTracker
    const clockInBtn = screen.getByTestId('mock-clock-in');
    fireEvent.click(clockInBtn);

    // Status is now On Site, TimeTracker remains mounted, and next button is Completed
    expect(screen.getByText('On Site')).toBeInTheDocument();
    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mark job status as Completed/i })).toBeInTheDocument();
  });

  test('integrates with LazyDetails workspace accordions (unmounted until opened)', () => {
    renderWithRoute('/job/job-workspaces');

    // Check summaries are present
    expect(screen.getByText('Inspection findings')).toBeInTheDocument();
    expect(screen.getByText('Property devices')).toBeInTheDocument();
    expect(screen.getByText('Reviewed product references')).toBeInTheDocument();
    expect(screen.getByText('Callback context and outcome')).toBeInTheDocument();

    // Workspaces should not be mounted initially due to LazyDetails
    expect(screen.queryByTestId('inspection-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('device-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('catalog-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('callback-workspace')).not.toBeInTheDocument();

    // Open "Inspection findings" details element
    const inspectionSummary = screen.getByText('Inspection findings');
    const inspectionDetails = inspectionSummary.closest('details');
    expect(inspectionDetails).not.toBeNull();

    if (inspectionDetails) {
      inspectionDetails.open = true;
      fireEvent(inspectionDetails, new Event('toggle'));
    }

    expect(screen.getByTestId('inspection-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('inspection-workspace')).toHaveTextContent(
      'InspectionWorkspace Mock (technician, job-workspaces)'
    );

    // Other workspaces remain unmounted
    expect(screen.queryByTestId('device-workspace')).not.toBeInTheDocument();
  });
});
