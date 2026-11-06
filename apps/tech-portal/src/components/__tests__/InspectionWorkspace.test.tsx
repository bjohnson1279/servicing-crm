import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InspectionWorkspace from '../inspections/InspectionWorkspace';
import { inspectionApi, inspectionToken, InspectionError, Inspection } from '../inspections/inspectionApi';

vi.mock('../inspections/inspectionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../inspections/inspectionApi')>();
  return {
    ...actual,
    inspectionApi: vi.fn(),
    inspectionToken: vi.fn(),
  };
});

describe('InspectionWorkspace Component', () => {
  const mockToken = 'mock-access-token';

  const mockInspection: Inspection = {
    id: 'insp-1',
    job_id: 'job-101',
    state: 'scheduled',
    version: 1,
    revision: 1,
    property_address: '456 Oak Avenue',
    customer_name: 'Wayne Enterprises',
    job_status: 'scheduled',
    revisions: [
      {
        revision: 1,
        findings: {
          summary: 'Initial perimeter walkthrough',
          zones: [
            {
              name: 'Basement North',
              pests: ['mice', 'ants'],
              evidence: 'observed',
              severity: 'moderate',
              inaccessible: false,
              notes: 'Evidence along baseboard',
            },
          ],
        },
      },
    ],
    attachments: [
      {
        id: 'att-1',
        name: 'basement_entry.jpg',
        revision: 1,
      },
    ],
    events: [
      {
        id: 'evt-1',
        action: 'create',
        reason: 'Initial job scheduling',
        created_at: '2026-03-01T08:00:00Z',
      },
    ],
  };

  const mockOptions = [
    {
      id: 'job-101',
      customer: { name: 'Wayne Enterprises' },
      property: { address: '456 Oak Avenue' },
    },
    {
      id: 'job-102',
      customer: { name: 'Acme Corp' },
      property: { address: '789 Pine Road' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inspectionToken).mockReturnValue(mockToken);
  });

  it('renders unauthenticated prompt when access token is missing', async () => {
    vi.mocked(inspectionToken).mockReturnValue(null);

    render(<InspectionWorkspace mode="staff" />);

    expect(
      screen.getByText('Sign in through your organization to view inspections.')
    ).toBeInTheDocument();
  });

  it('displays organization disabled notice and allows managers to enable inspections', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: false, role: 'MANAGER' };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    expect(
      await screen.findByText('Inspections are not enabled for your organization.')
    ).toBeInTheDocument();

    const enableButton = screen.getByRole('button', { name: 'Enable inspections' });
    expect(enableButton).toBeInTheDocument();

    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith('/settings', { enabled: true });
    });
  });

  it('renders technician view scoped to jobId and displays empty state when no inspections exist', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: true, role: 'TECHNICIAN' };
      }
      if (path.startsWith('/?')) {
        return { items: [], has_more: false };
      }
      return {};
    });

    render(<InspectionWorkspace mode="technician" jobId="job-tech-55" />);

    expect(
      await screen.findByText('No inspection is assigned to this job.')
    ).toBeInTheDocument();

    expect(inspectionApi).toHaveBeenCalledWith(expect.stringContaining('job_id=job-tech-55'));
    expect(screen.queryByText('Create inspection')).not.toBeInTheDocument();
  });

  it('allows staff to view scheduled jobs options and create a new inspection', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') {
        return { enabled: true, role: 'SUPER_ADMIN' };
      }
      if (path === '/options') {
        return mockOptions;
      }
      if (path.startsWith('/?')) {
        return { items: [mockInspection], has_more: false };
      }
      if (path === '/' && body) {
        return {
          ...mockInspection,
          id: 'insp-2',
          property_address: '789 Pine Road',
        };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    expect(
      await screen.findByText(/Wayne Enterprises — 456 Oak Avenue · scheduled/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create inspection' })).toBeDisabled();

    // Select job from dropdown
    const jobSelect = screen.getByLabelText('Scheduled job');
    fireEvent.change(jobSelect, { target: { value: 'job-102' } });

    const createButton = screen.getByRole('button', { name: 'Create inspection' });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          job_id: 'job-102',
          request_key: expect.any(String),
        })
      );
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('filters inspections by state and handles pagination controls', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) {
        return { items: [mockInspection], has_more: true };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    expect(
      await screen.findByText(/Wayne Enterprises — 456 Oak Avenue · scheduled/i)
    ).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(expect.stringContaining('offset=25'));
    });

    const filterSelect = screen.getByLabelText('Filter');
    fireEvent.change(filterSelect, { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(expect.stringContaining('state=in_progress'));
    });
  });

  it('selects a scheduled inspection, begins inspection and edits findings draft', async () => {
    const inProgressInspection: Inspection = {
      ...mockInspection,
      state: 'in_progress',
    };

    vi.mocked(inspectionApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockInspection], has_more: false };
      if (path === '/insp-1') return mockInspection;
      if (path === '/insp-1/start') return inProgressInspection;
      if (path === '/insp-1/save') {
        return {
          ...inProgressInspection,
          revisions: [
            {
              revision: 1,
              findings: (body as { findings: Inspection['revisions'][0]['findings'] }).findings,
            },
          ],
        };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · scheduled/i,
    });
    fireEvent.click(itemButton);

    const beginButton = await screen.findByRole('button', { name: 'Begin inspection' });
    fireEvent.click(beginButton);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/start',
        expect.objectContaining({
          id: 'insp-1',
          version: 1,
        })
      );
    });

    // Verify findings summary edit
    const summaryInput = await screen.findByLabelText('Findings summary');
    fireEvent.change(summaryInput, { target: { value: 'Updated findings after initial check' } });

    // Add new zone
    const addZoneBtn = screen.getByRole('button', { name: 'Add zone' });
    fireEvent.click(addZoneBtn);

    // Edit zone 2
    fireEvent.change(screen.getByLabelText('Zone name', { selector: '#zone-name-1' }), {
      target: { value: 'Attic West' },
    });
    fireEvent.change(screen.getByLabelText('Pests (comma separated)', { selector: '#zone-pests-1' }), {
      target: { value: 'wasps, spiders' },
    });
    fireEvent.change(screen.getByLabelText('Evidence', { selector: '#evidence-9644-1' }), {
      target: { value: 'reported' },
    });
    fireEvent.change(screen.getByLabelText('Severity', { selector: '#severity-7645-1' }), {
      target: { value: 'high' },
    });
    fireEvent.click(screen.getByLabelText('Inaccessible area', { selector: '#zone-inaccessible-1' }));
    fireEvent.change(screen.getByLabelText('Observations, conditions, concerns or access reason', { selector: '#zone-notes-1' }), {
      target: { value: 'High vaulted ceiling requires extension ladder' },
    });

    // Save draft
    const saveButton = screen.getByRole('button', { name: 'Save draft' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/save',
        expect.objectContaining({
          id: 'insp-1',
          version: 1,
          findings: expect.objectContaining({
            summary: 'Updated findings after initial check',
            zones: expect.arrayContaining([
              expect.objectContaining({ name: 'Basement North' }),
              expect.objectContaining({
                name: 'Attic West',
                pests: ['wasps', 'spiders'],
                evidence: 'reported',
                severity: 'high',
                inaccessible: true,
              }),
            ]),
          }),
        })
      );
    });
  });

  it('confirms zone removal via window.confirm, saves draft, and submits inspection draft for review', async () => {
    const inProgressInspection: Inspection = {
      ...mockInspection,
      state: 'in_progress',
    };
    const savedInspection: Inspection = {
      ...inProgressInspection,
      revisions: [
        {
          revision: 1,
          findings: { summary: inProgressInspection.revisions[0].findings.summary, zones: [] },
        },
      ],
    };
    const submittedInspection: Inspection = {
      ...savedInspection,
      state: 'submitted',
    };

    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [inProgressInspection], has_more: false };
      if (path === '/insp-1') return inProgressInspection;
      if (path === '/insp-1/save') return savedInspection;
      if (path === '/insp-1/submit') return submittedInspection;
      return {};
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · in progress/i,
    });
    fireEvent.click(itemButton);

    // Remove zone 1
    const removeZoneBtn = await screen.findByRole('button', { name: 'Remove zone 1' });
    fireEvent.click(removeZoneBtn);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to remove this zone and its findings?');
    expect(screen.queryByLabelText('Zone name', { selector: '#zone-name-0' })).not.toBeInTheDocument();

    // With dirty changes, 'Submit for review' is disabled until saved
    const submitBtn = screen.getByRole('button', { name: 'Submit for review' });
    expect(submitBtn).toBeDisabled();

    // Save draft to clear dirty flag
    const saveBtn = screen.getByRole('button', { name: 'Save draft' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/save',
        expect.objectContaining({
          id: 'insp-1',
          version: 1,
        })
      );
    });

    // Submit for review should now be enabled
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/submit',
        expect.objectContaining({
          id: 'insp-1',
          version: 1,
        })
      );
    });

    confirmSpy.mockRestore();
  });

  it('allows staff to approve findings or request revisions with review reason', async () => {
    const submittedInspection: Inspection = {
      ...mockInspection,
      state: 'submitted',
    };
    const reviewedInspection: Inspection = {
      ...submittedInspection,
      state: 'reviewed',
    };

    vi.mocked(inspectionApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [submittedInspection], has_more: false };
      if (path === '/insp-1') return submittedInspection;
      if (path === '/insp-1/review') {
        return reviewedInspection;
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · submitted/i,
    });
    fireEvent.click(itemButton);

    const approveBtn = await screen.findByRole('button', { name: 'Approve findings' });
    const revisionBtn = screen.getByRole('button', { name: 'Request revision' });

    // Both disabled until reason is entered
    expect(approveBtn).toBeDisabled();
    expect(revisionBtn).toBeDisabled();

    const reasonInput = screen.getByLabelText('Review reason');
    fireEvent.change(reasonInput, { target: { value: 'All zones thoroughly documented and signed off.' } });

    expect(approveBtn).toBeEnabled();
    expect(revisionBtn).toBeEnabled();

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/review',
        expect.objectContaining({
          id: 'insp-1',
          decision: 'reviewed',
          reason: 'All zones thoroughly documented and signed off.',
        })
      );
    });
  });

  it('disables revision request button when job status is completed, invoiced, or cancelled', async () => {
    const closedJobInspection: Inspection = {
      ...mockInspection,
      state: 'submitted',
      job_status: 'completed',
    };

    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [closedJobInspection], has_more: false };
      if (path === '/insp-1') return closedJobInspection;
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · submitted/i,
    });
    fireEvent.click(itemButton);

    fireEvent.change(await screen.findByLabelText('Review reason'), {
      target: { value: 'Need more attic photos' },
    });

    const revisionBtn = screen.getByRole('button', { name: 'Request revision' });
    expect(revisionBtn).toBeDisabled();
    expect(
      screen.getByText('Schedule a new inspection visit if additional findings are needed for this closed job.')
    ).toBeInTheDocument();
  });

  it('allows staff to cancel an inspection with reason', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockInspection], has_more: false };
      if (path === '/insp-1') return mockInspection;
      if (path === '/insp-1/cancel') {
        return {
          ...mockInspection,
          state: 'cancelled',
        };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · scheduled/i,
    });
    fireEvent.click(itemButton);

    const cancelReasonInput = await screen.findByLabelText('Cancellation reason');
    const cancelBtn = screen.getByRole('button', { name: 'Cancel inspection' });

    expect(cancelBtn).toBeDisabled();
    fireEvent.change(cancelReasonInput, { target: { value: 'Customer rescheduled service' } });
    expect(cancelBtn).toBeEnabled();

    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(inspectionApi).toHaveBeenCalledWith(
        '/insp-1/cancel',
        expect.objectContaining({
          id: 'insp-1',
          reason: 'Customer rescheduled service',
        })
      );
    });
  });

  it('handles attachment viewing and file upload validation', async () => {
    const inProgressInspection: Inspection = {
      ...mockInspection,
      state: 'in_progress',
    };

    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [inProgressInspection], has_more: false };
      if (path === '/insp-1') return inProgressInspection;
      if (path === '/insp-1/attachments/att-1') {
        return {
          name: 'basement_entry.jpg',
          media_type: 'image/jpeg',
          data: 'base64sampledata',
        };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · in progress/i,
    });
    fireEvent.click(itemButton);

    // View existing photo
    const viewPhotoBtn = await screen.findByRole('button', {
      name: /basement_entry.jpg · revision 1/i,
    });
    fireEvent.click(viewPhotoBtn);

    const img = await screen.findByRole('img', { name: 'basement_entry.jpg' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,base64sampledata');

    // Attempt upload of invalid file type
    const fileInput = screen.getByLabelText('Add photo');
    const invalidFile = new File(['text content'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(await screen.findByText('Choose a JPEG or PNG up to 1 MB.')).toBeInTheDocument();
  });

  it('handles network failure (status 0) and enables retry of unconfirmed action', async () => {
    let callCount = 0;
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockInspection], has_more: false };
      if (path === '/insp-1') return mockInspection;
      if (path === '/insp-1/start') {
        callCount++;
        if (callCount === 1) {
          throw new InspectionError(
            0,
            'Connection interrupted. Your action is not confirmed; retry when connected.'
          );
        }
        return {
          ...mockInspection,
          state: 'in_progress',
        };
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /Wayne Enterprises — 456 Oak Avenue · scheduled/i,
    });
    fireEvent.click(itemButton);

    const beginBtn = await screen.findByRole('button', { name: 'Begin inspection' });
    fireEvent.click(beginBtn);

    expect(
      await screen.findByText(
        'Connection interrupted. Your action is not confirmed; retry when connected.'
      )
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Retry unconfirmed action' });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('clears selected inspection and items when 401 authorization error occurs', async () => {
    vi.mocked(inspectionApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) {
        throw new InspectionError(401, 'Sign in through your organization to use inspections.');
      }
      return {};
    });

    render(<InspectionWorkspace mode="staff" />);

    expect(
      await screen.findByText('Sign in through your organization to use inspections.')
    ).toBeInTheDocument();

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.getByText('No inspections match this view. Select a scheduled job to create one.')
    ).toBeInTheDocument();
  });
});
