import { useEffect, useState } from 'react';
import { callbackDrafts, retryCallbackDraft } from '../callbackOfflineQueue';
import { callbackApi, CallbackCase } from './callbacks/callbackApi';

export function CallbackDrafts({ jobId }: { jobId: string }) {
  const [drafts,setDrafts] = useState<{ key:string; id:string; status:string; error?:string; body:{ findings:string; summary:string } }[]>([]);
  const [error,setError] = useState('');
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => { void callbackDrafts(jobId).then(setDrafts).catch(() => {}); };
    refresh(); window.addEventListener('callback_sync',refresh);
    return () => window.removeEventListener('callback_sync',refresh);
  },[jobId]);

  if (drafts.length === 0 && !error) return null;

  return <section aria-label="Saved callback outcomes" className="space-y-3 mt-4">
    {error && <div role="alert" aria-live="assertive" className="text-red-700 bg-red-50 p-2 rounded border border-red-200">{error}</div>}
    {drafts.map(d => <div key={d.key} className="border rounded p-4 bg-white shadow-sm space-y-2">
      <p className="font-semibold text-gray-800">Saved outcome: <span className={d.status === 'pending' ? 'text-gray-500 font-normal' : 'text-amber-600 font-normal'}>{d.status === 'pending' ? 'Pending sync' : 'Needs review'}</span></p>
      <p className="text-sm text-gray-700"><strong>Findings:</strong> {d.body.findings}</p>
      <p className="text-sm text-gray-700"><strong>Summary:</strong> {d.body.summary}</p>
      {d.error && <p className="text-sm text-red-600">{d.error}</p>}
      {d.status === 'needs_review' && <button className="mt-2 border rounded px-3 py-2 bg-blue-700 text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 hover:bg-blue-800 transition-colors" disabled={!navigator.onLine || retryingKey === d.key} aria-busy={retryingKey === d.key} onClick={async () => {
        setRetryingKey(d.key);
        setError('');
        try {
          const current = await callbackApi<CallbackCase>(`/${d.id}`);
          if (!['scheduled','in_service'].includes(current.state)) { setError('This case has moved on. Review the case with your dispatcher before changing the saved outcome.'); return; }
          await retryCallbackDraft(d.key,current.version); setDrafts(await callbackDrafts(jobId));
        } catch (e) { setError((e as Error).message); } finally { setRetryingKey(null); }
      }}>{retryingKey === d.key ? 'Retrying...' : 'I reviewed the current case; retry saved outcome'}</button>}
  </div>)}</section>;
}
