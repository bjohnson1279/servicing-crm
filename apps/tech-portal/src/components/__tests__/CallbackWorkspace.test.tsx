import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CallbackWorkspace from '../callbacks/CallbackWorkspace';
import { callbackApi, CallbackCase, watchCallbacks } from '../callbacks/callbackApi';

vi.mock('../callbacks/callbackApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../callbacks/callbackApi')>();
  return {
    ...actual,
    callbackApi: vi.fn(),
    watchCallbacks: vi.fn().mockResolvedValue(undefined),
  };
});

describe('CallbackWorkspace Component', () => {
  const mockCase: CallbackCase = {
    id: 'case-101',
    property_id: 'prop-1',
    customer_id: 'cust-1',
    property_address: '100 Main Street',
    customer_name: 'Acme Corp',
    pest_code: 'wasps',
    description: 'Wasps entering soffit near rear patio.',
    preferred_availability: 'Mornings before 11 AM',
    source_job_id: 'job-source-1',
    state: 'submitted',
    coverage: 'covered',
    coverage_reason: 'Under 30-day retreat warranty',
    billing_disposition: 'no_charge',
    reported_at: '2026-03-01T10:00:00Z',
    response_due_at: '2026-03-02T10:00:00Z',
    version: 1,
    events: [
      {
        id: 'evt-1',
        action: 'case_reported',
        customer_message: 'We noticed wasps returning after last week treatment.',
        created_at: '2026-03-01T10:00:00Z',
      },
    ],
    visits: [
      {
        id: 'visit-1',
        job_id: 'job-return-1',
        sequence: 1,
        job_status: 'scheduled',
        scheduled_start: '2026-03-03T09:00:00Z',
        summary: 'Targeted exterior aerosol and dust application',
        labor_minutes: 45,
        total_cost: 65.5,
        cost_complete: true,
      },
    ],
    attachments: [
      { id: 'att-1', name: 'soffit_nest.jpg' },
    ],
    quote: {
      id: 'quote-101',
      total_amount: 125.0,
      status: 'sent',
    },
    source_visit: {
      id: 'job-source-1',
      applications: [
        {
          id: 'app-1',
          chemical_name: 'Suspend PolyZone',
          quantity_used: 1.5,
          unit: 'oz',
          applied_at: '2026-02-15T14:30:00Z',
        },
      ],
    },
  };

  const mockOptions = {
    properties: [
      {
        id: 'prop-1',
        address: '100 Main Street',
        customer_id: 'cust-1',
        customer_name: 'Acme Corp',
      },
    ],
    jobs: [
      {
        id: 'job-source-1',
        property_id: 'prop-1',
        completed_at: '2026-02-15T15:00:00Z',
      },
    ],
    technicians: [
      { id: 'tech-1', name: 'John Doe' },
      { id: 'tech-2', name: 'Jane Smith' },
    ],
    quotes: [
      { id: 'quote-101', property_id: 'prop-1', total_amount: 125.0 },
    ],
  };

  const mockSettings = {
    enabled: true,
    role: 'MANAGER',
  };

  const mockReport = {
    eligible_source_jobs: 20,
    source_jobs_with_callback: 2,
    total_cases: 5,
    unlinked_cases: 1,
    average_first_response_hours: 2.5,
    average_resolution_hours: 18.0,
    additional_visits: 3,
  };

  const mockPolicies = [
    { id: 'pol-1', name: 'Residential General Pest 30-Day', version: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchCallbacks).mockResolvedValue(undefined);
    globalThis.crypto.randomUUID = vi.fn().mockReturnValue('mock-random-uuid');
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  it('renders initial loading state and displays error alert if fetching fails', async () => {
    vi.mocked(callbackApi).mockRejectedValueOnce(new Error('Network error loading callbacks'));

    render(<CallbackWorkspace mode="staff" />);

    expect(screen.getByText('Loading service requests…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error loading callbacks');
  });

  it('allows manager in staff mode to toggle pausing and enabling service requests via /settings', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) return { items: [] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return { enabled: false, role: 'MANAGER' };
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    expect(
      await screen.findByText(
        'New service requests are currently paused. Existing cases remain available.'
      )
    ).toBeInTheDocument();

    const enableBtn = screen.getByRole('button', { name: 'Enable new requests' });
    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith('/settings', { enabled: true });
    });
  });

  it('displays staff report metrics, allows filtering by state and paginates cases', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) {
        if (path.includes('offset=0')) {
          return { items: Array(25).fill(null).map((_, i) => ({ ...mockCase, id: `case-${i}` })) };
        }
        return { items: [mockCase] };
      }
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    expect(await screen.findByLabelText('Callback metrics')).toBeInTheDocument();
    expect(screen.getByText(/5 cases · 1 without a linked source visit · 3 additional return visits/i)).toBeInTheDocument();
    expect(screen.getByText(/Callback rate: 10.0%/i)).toBeInTheDocument();
    expect(screen.getByText(/Average response: 2.5 hours · Average resolution: 18.0 hours/i)).toBeInTheDocument();

    // Check pagination controls
    const prevBtn = screen.getByRole('button', { name: 'Previous' });
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(expect.stringContaining('offset=25'));
    });

    // Test filtering by status
    const filterSelect = screen.getByLabelText(/Filter by status/i);
    fireEvent.change(filterSelect, { target: { value: 'resolved' } });

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(expect.stringContaining('state=resolved'));
      expect(callbackApi).toHaveBeenCalledWith(expect.stringContaining('offset=0'));
    });
  });

  it('submits a new post-service callback request and resets the form', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/?')) return { items: [] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/' && body) {
        return { ...mockCase, id: 'case-new' };
      }
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    const reportDetails = (await screen.findByText('Report a problem after service')).closest('details')!;
    reportDetails.open = true;
    fireEvent(reportDetails, new Event('toggle'));

    fireEvent.change(screen.getByLabelText(/Service property/i), { target: { value: 'prop-1' } });
    fireEvent.change(screen.getByLabelText(/Related completed visit/i), {
      target: { value: 'job-source-1' },
    });
    fireEvent.change(screen.getByLabelText(/Pest or service issue/i), { target: { value: 'ants' } });
    fireEvent.change(screen.getByLabelText(/What are you seeing/i), {
      target: { value: 'Carpenter ants in master bathroom wall' },
    });
    fireEvent.change(screen.getByLabelText(/Preferred availability/i), {
      target: { value: 'Fridays any time' },
    });

    const submitBtn = screen.getByRole('button', { name: 'Submit request' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          property_id: 'prop-1',
          source_job_id: 'job-source-1',
          pest_code: 'ants',
          description: 'Carpenter ants in master bathroom wall',
          preferred_availability: 'Fridays any time',
          request_key: 'mock-random-uuid',
        })
      );
    });

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('selects a case, assesses coverage, creates return-service quote, and approves decision', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/?')) return { items: [mockCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/case-101/assess-coverage') return mockCase;
      if (path === '/case-101/quotes') return mockCase;
      if (path === '/case-101/decision') {
        return { ...mockCase, state: 'approved' };
      }
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    expect(await screen.findByText('Wasps entering soffit near rear patio.')).toBeInTheDocument();

    // Expand previous treatment applications LazyDetails
    const applicationsDetails = screen.getByText('Previous treatment applications').closest('details')!;
    applicationsDetails.open = true;
    fireEvent(applicationsDetails, new Event('toggle'));
    expect(screen.getByText(/Suspend PolyZone: 1.5 oz/i)).toBeInTheDocument();

    // Assess coverage
    const assessBtn = screen.getByRole('button', { name: 'Assess coverage' });
    fireEvent.click(assessBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/assess-coverage',
        expect.objectContaining({
          version: 1,
          source_job_id: 'job-source-1',
        })
      );
    });

    // Select quoted_paid to test return-service quote creation
    fireEvent.change(screen.getByLabelText(/Return visit billing/i), {
      target: { value: 'quoted_paid' },
    });

    fireEvent.change(screen.getByLabelText(/New return-service quote amount/i), {
      target: { value: '150' },
    });
    const sendQuoteBtn = screen.getByRole('button', { name: 'Send return-service quote' });
    fireEvent.click(sendQuoteBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/quotes',
        expect.objectContaining({
          version: 1,
          total_amount: 150,
        })
      );
    });

    // Provide reason and explanation to customer to enable decision buttons
    fireEvent.change(screen.getByLabelText(/Internal decision reason/i), {
      target: { value: 'Warranty claim verified and accepted' },
    });
    fireEvent.change(screen.getByLabelText(/Explanation to customer/i), {
      target: { value: 'A technician will return to treat the soffit area.' },
    });

    const approveBtn = screen.getByRole('button', { name: 'Approve return service' });
    expect(approveBtn).toBeEnabled();
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/decision',
        expect.objectContaining({
          version: 1,
          decision: 'approve',
          reason: 'Warranty claim verified and accepted',
          customer_message: 'A technician will return to treat the soffit area.',
        })
      );
    });
  });

  it('allows staff to schedule return visits, update technician assignment, and cancel visit keeping case open', async () => {
    const approvedCase: CallbackCase = {
      ...mockCase,
      state: 'approved',
    };

    vi.mocked(callbackApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/?')) return { items: [approvedCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/case-101/visits') return approvedCase;
      if (path === '/case-101/visit-update') return approvedCase;
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    // Schedule return visit
    fireEvent.change(screen.getByLabelText(/Return visit date and time/i), {
      target: { value: '2026-03-05T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/Technician \(optional; can assign in dispatch\)/i), {
      target: { value: 'tech-1' },
    });

    const scheduleBtn = screen.getByRole('button', { name: 'Schedule return visit' });
    fireEvent.click(scheduleBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/visits',
        expect.objectContaining({
          version: 1,
          technician_id: 'tech-1',
          request_key: 'mock-random-uuid',
        })
      );
    });

    // Update assignment and reschedule existing visit
    fireEvent.change(screen.getByLabelText(/Assign return visit technician/i), {
      target: { value: 'tech-2' },
    });
    fireEvent.change(screen.getByLabelText(/Reschedule visit \(optional\)/i), {
      target: { value: '2026-03-06T10:00' },
    });

    const updateVisitBtn = screen.getByRole('button', { name: 'Update assignment and schedule' });
    fireEvent.click(updateVisitBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/visit-update',
        expect.objectContaining({
          job_id: 'job-return-1',
          operation: 'schedule',
          technician_id: 'tech-2',
        })
      );
    });

    // Cancel visit with reason
    fireEvent.change(screen.getByLabelText(/Reason to cancel this visit/i), {
      target: { value: 'Customer out of town' },
    });
    const cancelVisitBtn = screen.getByRole('button', { name: 'Cancel visit; keep case open' });
    fireEvent.click(cancelVisitBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/visit-update',
        expect.objectContaining({
          job_id: 'job-return-1',
          operation: 'cancel',
          reason: 'Customer out of town',
        })
      );
    });
  });

  it('resolves a case awaiting review and supports reopening resolved case', async () => {
    const awaitingReviewCase: CallbackCase = {
      ...mockCase,
      state: 'awaiting_review',
    };
    const resolvedCase: CallbackCase = {
      ...mockCase,
      state: 'resolved',
    };

    let currentCase = awaitingReviewCase;

    vi.mocked(callbackApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/?')) return { items: [currentCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/case-101/resolution') {
        currentCase = resolvedCase;
        return resolvedCase;
      }
      if (path === '/case-101/reopen') {
        currentCase = mockCase;
        return mockCase;
      }
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    fireEvent.change(screen.getByLabelText(/Resolution category/i), {
      target: { value: 'completed_satisfactory' },
    });
    fireEvent.change(screen.getByLabelText(/Resolution summary/i), {
      target: { value: 'Nest eliminated and soffit gap sealed' },
    });
    fireEvent.change(screen.getByLabelText(/Resolution explanation to customer/i), {
      target: { value: 'All wasp activity resolved. Gap sealed.' },
    });

    const resolveBtn = screen.getByRole('button', { name: 'Resolve case' });
    fireEvent.click(resolveBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/resolution',
        expect.objectContaining({
          resolution_code: 'completed_satisfactory',
          summary: 'Nest eliminated and soffit gap sealed',
          customer_message: 'All wasp activity resolved. Gap sealed.',
        })
      );
    });

    // Now reopen the resolved case
    const reopenInput = await screen.findByLabelText(/Reason to reopen/i);
    fireEvent.change(reopenInput, {
      target: { value: 'Customer called stating wasps returned' },
    });
    const reopenBtn = screen.getByRole('button', { name: 'Reopen case' });
    fireEvent.click(reopenBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/reopen',
        expect.objectContaining({
          reason: 'Customer called stating wasps returned',
        })
      );
    });
  });

  it('supports customer mode: replying when awaiting customer and accepting return quote', async () => {
    const awaitingCustCase: CallbackCase = {
      ...mockCase,
      state: 'awaiting_customer',
    };

    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) return { items: [awaitingCustCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return { enabled: true, role: 'CUSTOMER' };
      if (path === '/case-101/reply') return awaitingCustCase;
      return {};
    });

    render(<CallbackWorkspace mode="customer" customerId="cust-1" />);

    expect(await screen.findByText('Service requests')).toBeInTheDocument();
    const caseButton = screen.getByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    fireEvent.change(screen.getByLabelText(/Your reply/i), {
      target: { value: 'Yes, morning arrival works perfectly.' },
    });
    const replyBtn = screen.getByRole('button', { name: 'Send reply' });
    fireEvent.click(replyBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/reply',
        expect.objectContaining({
          message: 'Yes, morning arrival works perfectly.',
        })
      );
    });
  });

  it('supports customer accepting return service quote when approved', async () => {
    const approvedCaseWithQuote: CallbackCase = {
      ...mockCase,
      state: 'approved',
      quote: {
        id: 'quote-101',
        total_amount: 125.0,
        status: 'sent',
      },
    };

    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) return { items: [approvedCaseWithQuote] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return { enabled: true, role: 'CUSTOMER' };
      if (path === '/case-101/accept-quote') return approvedCaseWithQuote;
      return {};
    });

    render(<CallbackWorkspace mode="customer" customerId="cust-1" />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    const acceptBtn = screen.getByRole('button', { name: /Accept return-service quote \(\$125\.00\)/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/accept-quote',
        expect.objectContaining({ version: 1 })
      );
    });
  });

  it('supports technician mode: starts return visit, submits outcome online, and falls back to offline queue', async () => {
    const inServiceCase: CallbackCase = {
      ...mockCase,
      state: 'in_service',
      visits: [
        {
          id: 'visit-1',
          job_id: 'job-tech-77',
          sequence: 1,
          job_status: 'scheduled',
          scheduled_start: '2026-03-03T09:00:00Z',
        },
      ],
    };

    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) return { items: [inServiceCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return { enabled: true, role: 'TECHNICIAN' };
      if (path === '/case-101/visit-update') return inServiceCase;
      if (path === '/case-101/outcome') return inServiceCase;
      return {};
    });

    const mockQueueOutcome = vi.fn().mockResolvedValue(undefined);

    render(<CallbackWorkspace mode="technician" jobId="job-tech-77" queueOutcome={mockQueueOutcome} />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    // Start return visit button
    const startVisitBtn = screen.getByRole('button', { name: 'Start return visit' });
    fireEvent.click(startVisitBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/visit-update',
        expect.objectContaining({
          job_id: 'job-tech-77',
          operation: 'start',
        })
      );
    });

    // Fill outcome form
    fireEvent.change(screen.getByLabelText(/Inspection findings/i), {
      target: { value: 'Active wasp nest found inside exhaust vent' },
    });
    fireEvent.change(screen.getByLabelText(/Visit outcome/i), {
      target: { value: 'treated' },
    });
    fireEvent.change(screen.getByLabelText(/Work performed and next steps/i), {
      target: { value: 'Dusted vent and removed nest remnants' },
    });

    const submitOutcomeBtn = screen.getByRole('button', { name: 'Submit outcome for review' });
    fireEvent.click(submitOutcomeBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/case-101/outcome',
        expect.objectContaining({
          job_id: 'job-tech-77',
          findings: 'Active wasp nest found inside exhaust vent',
          resolution_code: 'treated',
          summary: 'Dusted vent and removed nest remnants',
        })
      );
    });

    // Now test offline fallback when navigator.onLine is false
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

    fireEvent.click(submitOutcomeBtn);

    await waitFor(() => {
      expect(mockQueueOutcome).toHaveBeenCalledWith(
        'case-101',
        expect.objectContaining({
          job_id: 'job-tech-77',
          resolution_code: 'treated',
        })
      );
    });

    expect(
      await screen.findByText('Outcome saved on this device. Pending sync; the case is still open.')
    ).toBeInTheDocument();
  });

  it('validates photo uploads (size and mime type) and views photos via secure window.open', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string) => {
      if (path.startsWith('/?')) return { items: [mockCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/case-101/attachments/att-1') {
        return { media_type: 'image/jpeg', data: btoa('testimagedata') };
      }
      return {};
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    globalThis.URL.revokeObjectURL = vi.fn();

    render(<CallbackWorkspace mode="staff" />);

    const caseButton = await screen.findByRole('button', { name: /100 Main Street/i });
    fireEvent.click(caseButton);

    // View photo
    const photoBtn = screen.getByRole('button', { name: 'soffit_nest.jpg' });
    fireEvent.click(photoBtn);

    await waitFor(() => {
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'blob:http://localhost/test-blob',
        '_blank',
        'noopener,noreferrer'
      );
    });

    // Test file upload validation: reject invalid file type
    const fileInput = screen.getByLabelText(/Add photo/i);
    const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [textFile] } });

    expect(await screen.findByText('Choose a JPEG or PNG up to 1 MB.')).toBeInTheDocument();

    // Test file upload validation: reject oversized file (>1MB)
    const largeFile = new File([new Uint8Array(1048577)], 'large.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(await screen.findByText('Choose a JPEG or PNG up to 1 MB.')).toBeInTheDocument();

    windowOpenSpy.mockRestore();
  });

  it('allows manager to administer warranty policies (timezone, labor rate, create version, assign)', async () => {
    vi.mocked(callbackApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/?')) return { items: [mockCase] };
      if (path === '/options') return mockOptions;
      if (path === '/settings') return mockSettings;
      if (path === '/policies') return mockPolicies;
      if (path === '/report') return mockReport;
      if (path === '/settings' && body) return mockSettings;
      if (path === '/policies' && body) return mockPolicies;
      if (path === '/policies/assign' && body) return {};
      return {};
    });

    render(<CallbackWorkspace mode="staff" />);

    const policyDetails = (await screen.findByText('Warranty policy administration')).closest('details')!;
    policyDetails.open = true;
    fireEvent(policyDetails, new Event('toggle'));

    // Timezone save
    fireEvent.change(screen.getByLabelText(/Contract date time zone/i), {
      target: { value: 'America/Denver' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith('/settings', { timezone: 'America/Denver' });
    });

    // Labor rate save
    fireEvent.change(screen.getByLabelText(/Hourly labor cost/i), {
      target: { value: '85' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save labor rate' }));

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith('/settings', { hourly_labor_rate: 85 });
    });

    // Create policy version
    fireEvent.change(screen.getByLabelText(/Policy name/i), { target: { value: 'General Pest 60' } });
    fireEvent.change(screen.getByLabelText(/^Version/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Reporting window in days/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/Covered pests/i), {
      target: { value: 'ants, spiders, wasps' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create immutable policy version' }));

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/policies',
        expect.objectContaining({
          name: 'General Pest 60',
          version: 2,
          reporting_window_days: 60,
          covered_pests: ['ants', 'spiders', 'wasps'],
        })
      );
    });

    // Assign policy
    fireEvent.change(screen.getByLabelText(/Policy version/i), { target: { value: 'pol-1' } });
    fireEvent.change(screen.getByLabelText(/Assign to/i), { target: { value: 'contract' } });
    fireEvent.change(screen.getByLabelText(/Contract or job ID/i), { target: { value: 'contract-99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign policy' }));

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith(
        '/policies/assign',
        expect.objectContaining({
          policy_id: 'pol-1',
          kind: 'contract',
          target_id: 'contract-99',
        })
      );
    });
  });
});
