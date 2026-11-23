import { openDB } from 'idb';
import { playbookApi, playbookToken, PlaybookError } from './components/playbooks/playbookApi';

const open = () =>
  openDB('playbook-runs', 1, {
    upgrade(db) {
      db.createObjectStore('runs', { keyPath: 'key' });
    },
  });

let syncing = false;

function identity(): string {
  const token = playbookToken();
  if (!token) throw new Error('Sign in before saving an offline playbook checklist.');
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(raw));
    if (!claims.id || !claims.tenantId) throw new Error();
    return `${claims.tenantId}:${claims.id}`;
  } catch {
    throw new Error('Sign in before saving an offline playbook checklist.');
  }
}

export async function queuePlaybookSubmission(id: string, body: Record<string, unknown>) {
  const owner = identity();
  const db = await open();
  await db.put('runs', { key: body.request_key, id, body, owner, status: 'pending' });
  window.dispatchEvent(new CustomEvent('playbook_sync', { detail: 'Checklist saved on this device; pending sync.' }));
}

export async function syncPlaybookSubmissions() {
  if (syncing || !navigator.onLine || !playbookToken()) return;
  syncing = true;
  try {
    const owner = identity();
    const db = await open();
    const entries = await db.getAll('runs');
    for (const entry of entries.filter(e => e.owner === owner && e.status === 'pending')) {
      try {
        await playbookApi(`/${entry.id}/submit`, entry.body);
        await db.delete('runs', entry.key);
        window.dispatchEvent(
          new CustomEvent('playbook_sync', { detail: 'Playbook checklist synced and confirmed by server.' })
        );
      } catch (e) {
        if (e instanceof PlaybookError && [400, 403, 404, 409].includes(e.status)) {
          await db.put('runs', { ...entry, status: 'needs_review', error: e.message });
          window.dispatchEvent(
            new CustomEvent('playbook_sync', {
              detail: `Playbook submission needs review: ${e.message}. Your draft is retained on this device.`,
            })
          );
        }
        if (e instanceof PlaybookError && e.status === 401) break;
      }
    }
  } finally {
    syncing = false;
  }
}

window.addEventListener('online', () => {
  void syncPlaybookSubmissions();
});

export async function playbookDrafts(jobId: string) {
  const db = await open();
  const owner = identity();
  return (await db.getAll('runs')).filter(e => e.owner === owner && e.body.job_id === jobId);
}

export async function retryPlaybookDraft(key: string, version: number) {
  const db = await open();
  const entry = await db.get('runs', key);
  if (!entry || entry.owner !== identity()) throw new Error('Playbook draft not found');
  await db.put('runs', { ...entry, status: 'pending', body: { ...entry.body, version } });
  await syncPlaybookSubmissions();
}
