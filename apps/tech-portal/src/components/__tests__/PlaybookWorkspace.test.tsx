import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import PlaybookWorkspace from '../playbooks/PlaybookWorkspace';
import { playbookApi, PlaybookError } from '../playbooks/playbookApi';
import { queuePlaybookSubmission, syncPlaybookSubmissions } from '../../playbookOfflineQueue';

vi.mock('../../playbookOfflineQueue', () => ({
  queuePlaybookSubmission: vi.fn().mockResolvedValue(undefined),
  syncPlaybookSubmissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../playbooks/playbookApi', () => ({
  playbookApi: vi.fn(),
  playbookToken: () => 'tech-token',
  PlaybookError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const api = vi.mocked(playbookApi);

const assignedRun = {
  id: 'run-1',
  job_id: 'job-1',
  property_id: 'prop-1',
  property_address: '100 Oak Ave',
  checklist_version_id: 'tpl-1',
  checklist_title: 'Quarterly Exterior',
  state: 'pending_ack' as const,
  version: 1,
  brief_snapshot: {
    access_instructions: 'Use side gate; lock after entry',
    known_hazards: 'Steep basement stairs',
    pets_notes: 'Friendly retriever',
  },
  checklist_snapshot: [
    { id: 'inspect_eaves', label: 'Sweep eaves', required: true },
  ],
  responses: {},
  exceptions: {},
  observations: '',
  follow_up_flagged: false,
  events: [],
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async path => {
    if (path === '/settings') return { enabled: true, role: 'TECHNICIAN' } as never;
    if (path.startsWith('/?')) return { items: [assignedRun] } as never;
    if (path.endsWith('/acknowledge')) return { ...assignedRun, state: 'in_progress', version: 2 } as never;
    if (path.endsWith('/submit')) return { ...assignedRun, state: 'submitted', version: 3 } as never;
    if (path.startsWith('/completion-check')) return { ready: true, blocking_reasons: [] } as never;
    return assignedRun as never;
  });
});

afterEach(cleanup);

it('acknowledges property service brief and submits checklist responses for assigned job', async () => {
  render(<PlaybookWorkspace jobId="job-1" />);
  fireEvent.click(await screen.findByRole('button', { name: /100 Oak Ave/ }));
  await screen.findByText(/Access: Use side gate; lock after entry/);

  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge property brief' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/run-1/acknowledge', { id: 'run-1', version: 1 }));

  fireEvent.change(await screen.findByLabelText('Response for Sweep eaves'), {
    target: { value: 'Cleared eave webbing' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit checklist' }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/run-1/submit',
      expect.objectContaining({
        id: 'run-1',
        responses: { inspect_eaves: 'Cleared eave webbing' },
      })
    )
  );
});

it('queues checklist submission offline on network failure and checks completion gate', async () => {
  api.mockImplementation(async path => {
    if (path === '/settings') return { enabled: true, role: 'TECHNICIAN' } as never;
    if (path.startsWith('/?')) return { items: [{ ...assignedRun, state: 'in_progress', version: 2 }] } as never;
    if (path.endsWith('/submit')) throw new PlaybookError(0, 'Connection interrupted');
    if (path.startsWith('/completion-check')) return { ready: false, blocking_reasons: ['run_not_submitted'] } as never;
    return assignedRun as never;
  });

  render(<PlaybookWorkspace jobId="job-1" />);
  fireEvent.click(await screen.findByRole('button', { name: /100 Oak Ave/ }));

  fireEvent.change(await screen.findByLabelText('Response for Sweep eaves'), {
    target: { value: 'Offline eave check' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit checklist' }));

  await screen.findByText(/Saved offline; will sync when connection is restored/);
  expect(vi.mocked(queuePlaybookSubmission)).toHaveBeenCalledWith(
    'run-1',
    expect.objectContaining({
      job_id: 'job-1',
      responses: { inspect_eaves: 'Offline eave check' },
      request_key: expect.any(String),
    })
  );

  fireEvent.click(screen.getByRole('button', { name: 'Sync offline queue' }));
  await waitFor(() => expect(vi.mocked(syncPlaybookSubmissions)).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Check completion gate' }));
  await screen.findByText(/Completion gate: Blocked \(run_not_submitted\)/);
});
