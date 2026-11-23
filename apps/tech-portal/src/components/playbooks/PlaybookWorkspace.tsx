import { useEffect, useState } from 'react';
import { playbookApi, playbookToken, PlaybookError } from './playbookApi';
import type { PlaybookRun } from './playbookApi';

export default function PlaybookWorkspace({ jobId }: { jobId?: string }) {
  const [token] = useState(playbookToken());
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<PlaybookRun[]>([]);
  const [selected, setSelected] = useState<PlaybookRun>();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  function fail(e: unknown) {
    setNotice(e instanceof Error ? e.message : 'Playbook request failed');
    if (e instanceof PlaybookError && [401, 403, 404].includes(e.status)) {
      setSelected(undefined);
      setItems([]);
    }
  }

  async function load(active: () => boolean = () => true) {
    const settings = await playbookApi<{ enabled: boolean; role: string }>('/settings');
    if (!active()) return;
    setEnabled(settings.enabled);
    if (!settings.enabled) {
      setItems([]);
      return;
    }
    const q = new URLSearchParams();
    if (jobId) q.set('job_id', jobId);
    const list = await playbookApi<{ items: PlaybookRun[] }>('/?' + q);
    if (!active()) return;
    setItems(list.items);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    load(() => active)
      .catch(e => {
        if (active) fail(e);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token, jobId]);

  function choose(run: PlaybookRun) {
    setSelected(run);
    setResponses(run.responses || {});
    setExceptions(run.exceptions || {});
    setObservations(run.observations || '');
    setFollowUp(Boolean(run.follow_up_flagged));
  }

  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setNotice('');
    try {
      const updated = await playbookApi<PlaybookRun>(path, body);
      choose(updated);
      setNotice('Saved and confirmed by the server.');
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Property service playbooks" className="space-y-4">
      <h2 className="text-xl font-semibold">Property service playbook</h2>
      <p role="status" aria-live="polite">
        {busy ? 'Working…' : notice}
      </p>
      {!token && <p>Sign in through your organization to view your assigned playbook.</p>}
      {token && !enabled && !busy && <p>Property service playbooks are not enabled for your organization.</p>}
      {enabled && (
        <>
          {items.length === 0 ? (
            <p>No active playbook is assigned to this job.</p>
          ) : (
            <ul>
              {items.map(r => (
                <li key={r.id}>
                  <button disabled={busy} onClick={() => choose(r)}>
                    {r.property_address || r.property_id} — {r.checklist_title || 'Checklist'} · {r.state}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <article className="border rounded p-4 space-y-3">
              <h3 className="font-semibold">
                {selected.property_address || selected.property_id} · {selected.state}
              </h3>
              <p>Access: {selected.brief_snapshot.access_instructions}</p>
              {selected.brief_snapshot.known_hazards && <p>Hazards: {selected.brief_snapshot.known_hazards}</p>}
              {selected.brief_snapshot.pets_notes && <p>Pets: {selected.brief_snapshot.pets_notes}</p>}

              {selected.state === 'pending_ack' && (
                <button
                  disabled={busy}
                  onClick={() => act('/' + selected.id + '/acknowledge', { id: selected.id, version: selected.version })}
                >
                  Acknowledge property brief
                </button>
              )}

              {selected.state === 'in_progress' && (
                <fieldset disabled={busy} className="space-y-2">
                  <legend>Visit checklist</legend>
                  {selected.checklist_snapshot.map(task => (
                    <div key={task.id}>
                      <label>
                        {task.label} {task.required ? '(Required)' : '(Optional)'}{' '}
                        <input
                          aria-label={`Response for ${task.label}`}
                          value={responses[task.id] || ''}
                          onChange={e => setResponses({ ...responses, [task.id]: e.target.value })}
                        />
                      </label>
                      <label>
                        Exception for {task.label}{' '}
                        <input
                          aria-label={`Exception for ${task.label}`}
                          value={exceptions[task.id] || ''}
                          onChange={e => setExceptions({ ...exceptions, [task.id]: e.target.value })}
                        />
                      </label>
                    </div>
                  ))}
                  <label>
                    Visit observations{' '}
                    <textarea value={observations} onChange={e => setObservations(e.target.value)} />
                  </label>
                  <label>
                    <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} /> Flag for
                    office follow-up
                  </label>
                  <button
                    onClick={() =>
                      act('/' + selected.id + '/submit', {
                        id: selected.id,
                        version: selected.version,
                        responses,
                        exceptions,
                        observations,
                        follow_up_flagged: followUp,
                      })
                    }
                  >
                    Submit checklist
                  </button>
                </fieldset>
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
