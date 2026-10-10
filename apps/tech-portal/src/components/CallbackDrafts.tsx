import { useEffect, useState } from 'react';
import { callbackDrafts, retryCallbackDraft } from '../callbackOfflineQueue';
import { callbackApi, CallbackCase } from './callbacks/callbackApi';

export function CallbackDrafts({ jobId }: { jobId: string }) {
  const [drafts,setDrafts] = useState<{ key:string; id:string; status:string; error?:string; body:{ findings:string; summary:string } }[]>([]);
  const [error,setError] = useState('');
  useEffect(() => {
    const refresh = () => { void callbackDrafts(jobId).then(setDrafts).catch(() => {}); };
    refresh(); window.addEventListener('callback_sync',refresh);
    return () => window.removeEventListener('callback_sync',refresh);
  },[jobId]);
  return <section aria-label="Saved callback outcomes"><div role="alert">{error}</div>{drafts.map(d => <div key={d.key} className="border rounded p-3">
    <p>Saved outcome: {d.status === 'pending' ? 'Pending sync' : 'Needs review'}</p><p>{d.body.findings}</p><p>{d.body.summary}</p><p>{d.error}</p>
    {d.status === 'needs_review' && <button disabled={!navigator.onLine} onClick={async () => {
      try {
        const current = await callbackApi<CallbackCase>(`/${d.id}`);
        if (!['scheduled','in_service'].includes(current.state)) { setError('This case has moved on. Review the case with your dispatcher before changing the saved outcome.'); return; }
        await retryCallbackDraft(d.key,current.version); setDrafts(await callbackDrafts(jobId));
      } catch (e) { setError((e as Error).message); }
    }}>I reviewed the current case; retry saved outcome</button>}
  </div>)}</section>;
}
