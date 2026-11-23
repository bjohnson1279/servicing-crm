import { beforeEach, expect, it, vi } from 'vitest';
import { playbookApi, playbookToken, PlaybookError } from './components/playbooks/playbookApi';
import {
  queuePlaybookSubmission,
  syncPlaybookSubmissions,
  playbookDrafts,
  retryPlaybookDraft,
} from './playbookOfflineQueue';

const records = vi.hoisted(() => new Map<string, any>());
vi.mock('idb', () => ({
  openDB: vi.fn().mockImplementation(async () => ({
    put: async (_: string, entry: any) => records.set(entry.key, entry),
    getAll: async () => Array.from(records.values()),
    get: async (_: string, key: string) => records.get(key),
    delete: async (_: string, key: string) => records.delete(key),
  })),
}));

vi.mock('./components/playbooks/playbookApi', async () => {
  const actual = await vi.importActual<typeof import('./components/playbooks/playbookApi')>(
    './components/playbooks/playbookApi'
  );
  return { ...actual, playbookApi: vi.fn(), playbookToken: vi.fn() };
});

const token = (id: string) => 'header.' + btoa(JSON.stringify({ id, tenantId: 'tenant-1' })) + '.signature';

beforeEach(() => {
  records.clear();
  vi.mocked(playbookApi).mockReset();
  vi.mocked(playbookToken).mockReturnValue(token('tech-1'));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

it('queues and syncs playbook submissions with idempotency key and deletes after server confirmation', async () => {
  const body = {
    job_id: 'job-1',
    request_key: 'pb-key-1',
    version: 2,
    responses: { inspect_eaves: 'Done' },
    observations: 'All clear',
  };
  await queuePlaybookSubmission('run-1', body);
  expect(records.size).toBe(1);

  vi.mocked(playbookApi).mockResolvedValue({});
  await syncPlaybookSubmissions();
  expect(playbookApi).toHaveBeenCalledWith('/run-1/submit', body);
  expect(records.size).toBe(0);
});

it('marks 409 conflicts as needs_review and supports retryPlaybookDraft with updated version', async () => {
  await queuePlaybookSubmission('run-1', { job_id: 'job-1', request_key: 'pb-key-2', version: 2 });
  vi.mocked(playbookApi).mockRejectedValueOnce(new PlaybookError(409, 'Playbook run changed'));
  await syncPlaybookSubmissions();
  expect((await playbookDrafts('job-1'))[0].status).toBe('needs_review');

  vi.mocked(playbookApi).mockResolvedValueOnce({});
  await retryPlaybookDraft('pb-key-2', 3);
  expect(playbookApi).toHaveBeenLastCalledWith('/run-1/submit', {
    job_id: 'job-1',
    request_key: 'pb-key-2',
    version: 3,
  });
  expect(records.size).toBe(0);
});

it('isolates queued playbook drafts by authenticated technician identity', async () => {
  await queuePlaybookSubmission('run-1', { job_id: 'job-1', request_key: 'pb-key-3', version: 1 });
  vi.mocked(playbookToken).mockReturnValue(token('tech-2'));
  await syncPlaybookSubmissions();
  expect(playbookApi).not.toHaveBeenCalled();
  expect(records.size).toBe(1);
});
