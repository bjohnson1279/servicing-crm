import { openDB } from 'idb';
import { callbackApi, callbackToken, CallbackHttpError } from './components/callbacks/callbackApi';

const open = () => openDB('callback-outcomes', 1, { upgrade(db) { db.createObjectStore('outcomes', { keyPath: 'key' }); } });
let syncing = false;
function identity(): string {
  const token = callbackToken();
  if (!token) throw new Error('Sign in before saving an offline outcome.');
  // Used only to partition local drafts; the server validates all authorization.
  try {
    const raw = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims = JSON.parse(atob(raw));
    if (!claims.id || !claims.tenantId) throw new Error();
    return `${claims.tenantId}:${claims.id}`;
  } catch { throw new Error('Sign in before saving an offline outcome.'); }
}
export async function queueCallbackOutcome(id: string, body: Record<string, unknown>) {
  const owner = identity();
  const db = await open();
  await db.put('outcomes', { key: body.request_key, id, body, owner, status: 'pending' });
  window.dispatchEvent(new CustomEvent('callback_sync', { detail: 'Outcome saved on this device; pending sync.' }));
}
export async function syncCallbackOutcomes() {
  if (syncing || !navigator.onLine || !callbackToken()) return;
  syncing = true;
  try {
    const owner = identity();
    const db = await open();
    const entries = await db.getAll('outcomes');
    for (const entry of entries.filter(e => e.owner === owner && e.status === 'pending')) {
      try {
        await callbackApi(`/${entry.id}/outcome`, entry.body);
        await db.delete('outcomes', entry.key);
        window.dispatchEvent(new CustomEvent('callback_sync', { detail: 'Outcome synced. The case is awaiting staff review.' }));
      } catch (e) {
        // Preserve failures; authorization and conflicts require explicit review.
        if (e instanceof CallbackHttpError && [400,403,404,409].includes(e.status)) {
          await db.put('outcomes', { ...entry, status: 'needs_review', error: e.message });
          window.dispatchEvent(new CustomEvent('callback_sync', { detail: `Outcome needs review: ${e.message}. Your draft is retained on this device.` }));
        }
        if (e instanceof CallbackHttpError && e.status === 401) break;
      }
    }
  } finally { syncing = false; }
}
window.addEventListener('online', () => { void syncCallbackOutcomes(); });

export async function callbackDrafts(jobId: string) {
  const db = await open();
  const owner = identity();
  return (await db.getAll('outcomes')).filter(e => e.owner === owner && e.body.job_id === jobId);
}
export async function retryCallbackDraft(key: string, version: number) {
  const db = await open();
  const entry = await db.get('outcomes',key);
  if (!entry || entry.owner !== identity()) throw new Error('Draft not found');
  await db.put('outcomes',{...entry,status:'pending',body:{...entry.body,version}});
  await syncCallbackOutcomes();
}
