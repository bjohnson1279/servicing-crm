import { FormEvent, useEffect, useState } from 'react';
import { callbackApi, CallbackCase, watchCallbacks } from './callbackApi';

interface Options {
  properties: { id: string; address: string; customer_id: string; customer_name: string }[];
  jobs: { id: string; property_id: string; completed_at: string }[];
  technicians?: { id: string; name: string }[];
  quotes?: { id: string; property_id: string; total_amount: number }[];
}
type Fields = Record<string, string>;
const label = (value: string) => value.replace(/_/g, ' ');
const closed = ['resolved', 'declined', 'cancelled'];
const controls = 'border rounded p-2 w-full bg-white text-gray-900';
const button = 'border rounded px-3 py-2 bg-blue-700 text-white disabled:opacity-50';

export default function CallbackWorkspace({ mode, customerId, jobId, queueOutcome }: {
  mode: 'staff' | 'customer' | 'technician'; customerId?: string; jobId?: string;
  queueOutcome?: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  jobId = jobId || (mode === 'staff' ? new URLSearchParams(window.location.search).get('job_id') || undefined : undefined);
  const [items, setItems] = useState<CallbackCase[]>([]);
  const [selected, setSelected] = useState<string>();
  const [options, setOptions] = useState<Options>({ properties: [], jobs: [] });
  const [settings, setSettings] = useState<{ enabled: boolean; role: string }>();
  const [fields, setFields] = useState<Fields>({});
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [policies, setPolicies] = useState<{ id: string; name: string; version: number }[]>([]);
  const [report, setReport] = useState<{ eligible_source_jobs: number; source_jobs_with_callback: number; total_cases: number; unlinked_cases: number; average_first_response_hours: number | null; average_resolution_hours: number | null; additional_visits: number }>();
  const current = items.find(item => item.id === selected);
  const manager = settings?.role === 'MANAGER' || settings?.role === 'SUPER_ADMIN';

  async function refresh() {
    const query = new URLSearchParams({ limit: '25', offset: String(offset) });
    if (filter) query.set('state', filter);
    if (customerId) query.set('customer_id', customerId);
    if (jobId) query.set('job_id', jobId);
    const [page, choices, config] = await Promise.all([
      callbackApi<{ items: CallbackCase[] }>('/?' + query), callbackApi<Options>('/options'),
      callbackApi<{ enabled: boolean; role: string }>('/settings'),
    ]);
    setItems(page.items); setOptions(choices); setSettings(config);
    if (mode === 'staff') {
      const [policyList, metrics] = await Promise.all([callbackApi<typeof policies>('/policies'),callbackApi<NonNullable<typeof report>>('/report')]);
      setPolicies(policyList); setReport(metrics);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, offset, customerId, jobId]);
  useEffect(() => {
    const controller = new AbortController();
    void watchCallbacks(controller.signal,() => { void refresh().catch(() => {}); }).catch(() => {});
    return () => controller.abort();
  },[filter,offset,customerId,jobId]);

  function field(name: string, title: string, required = false, type = 'text') {
    return <label className="block space-y-1" key={name}>{title}
      <input className={controls} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={fields[name] || ''} required={required}
        onChange={e => setFields(prev => ({ ...prev, [name]: e.target.value }))} />
    </label>;
  }
  function choose(name: string, title: string, choices: { value: string; text: string }[], required = false) {
    return <label className="block space-y-1">{title}<select className={controls} required={required} value={fields[name] || ''}
      onChange={e => setFields(prev => ({ ...prev, [name]: e.target.value, ...(name === 'property_id' ? { source_job_id: '' } : {}) }))}>
      <option value="">Choose…</option>{choices.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
    </select></label>;
  }
  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await callbackApi<CallbackCase>(path, body);
      if (updated.id) setSelected(updated.id);
      await refresh(); setNotice('Saved.'); return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    if (await act('/', { ...fields, source_job_id: fields.source_job_id || null, request_key: requestKey })) {
      setFields({}); setRequestKey(crypto.randomUUID());
    }
  }
  async function command(action: string, body: Record<string, unknown> = {}) {
    if (current) await act(`/${current.id}/${action}`, { version: current.version, ...body });
  }
  async function upload(file: File) {
    if (!current) return;
    if (!['image/jpeg','image/png'].includes(file.type) || file.size > 1048576) { setError('Choose a JPEG or PNG up to 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { void command('attachments', { name: file.name, media_type: file.type, data: String(reader.result).split(',')[1] }); };
    reader.readAsDataURL(file);
  }
  async function viewPhoto(id: string) {
    try {
      const image = await callbackApi<{ media_type: string; data: string }>(`/${current!.id}/attachments/${id}`);
      const bytes = Uint8Array.from(atob(image.data.replace(/\s/g, '')), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: image.media_type }));
      window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError((e as Error).message); }
  }

  return <section className="space-y-5 pb-20" aria-label="Callbacks and warranty service">
    <h1 className="text-2xl font-bold">{mode === 'customer' ? 'Service requests' : 'Callbacks & warranty service'}</h1>
    <div role="alert" className="text-red-700">{error}</div><div role="status" aria-live="polite">{notice}</div>
    {loading && <p>Loading service requests…</p>}
    {!loading && settings && <>
      {!navigator.onLine && <p role="status">Offline: showing the last loaded case data. Outcomes remain pending until synced.</p>}
      {manager && mode === 'staff' && <button disabled={busy} className={button}
        onClick={() => void act('/settings', { enabled: !settings.enabled })}>{settings.enabled ? 'Pause new requests' : 'Enable new requests'}</button>}
      {!settings.enabled && <p>New service requests are currently paused. Existing cases remain available.</p>}
      {mode === 'staff' && report && <div className="border rounded p-4 space-y-2" aria-label="Callback metrics">
        <p><strong>Last 90 days:</strong> {report.total_cases} cases · {report.unlinked_cases} without a linked source visit · {report.additional_visits} additional return visits</p>
        <p>Callback rate: {report.eligible_source_jobs ? `${(100*report.source_jobs_with_callback/report.eligible_source_jobs).toFixed(1)}%` : 'No eligible visits'} ({report.source_jobs_with_callback} original visits with a callback / {report.eligible_source_jobs} completed original visits)</p>
        <p>Average response: {report.average_first_response_hours == null ? 'Not recorded' : `${Number(report.average_first_response_hours).toFixed(1)} hours`} · Average resolution: {report.average_resolution_hours == null ? 'Not recorded' : `${Number(report.average_resolution_hours).toFixed(1)} hours`}</p>
        <p className="text-sm">Service-date cohort observed through today. Recent visits have less follow-up time.</p>
      </div>}
      {mode !== 'technician' && settings.enabled && <details className="border rounded p-4">
        <summary className="cursor-pointer font-semibold">Report a problem after service</summary>
        <form onSubmit={create} className="space-y-3 mt-3 max-w-xl">
          {choose('property_id','Service property',options.properties.filter(p => !customerId || p.customer_id === customerId).map(p => ({ value:p.id,text: mode === 'staff' ? `${p.customer_name} — ${p.address}` : p.address })),true)}
          {choose('source_job_id','Related completed visit (optional)',options.jobs.filter(j => j.property_id === fields.property_id).map(j => ({ value:j.id,text:new Date(j.completed_at).toLocaleString() })))}
          {field('pest_code','Pest or service issue',true)}
          <label className="block">What are you seeing?<textarea className={controls} required maxLength={10000} value={fields.description || ''} onChange={e => setFields(prev => ({ ...prev,description:e.target.value }))} /></label>
          {field('preferred_availability','Preferred availability (optional)')}
          <p>Our team will review coverage before confirming service or charges.</p>
          <button className={button} disabled={busy}>Submit request</button>
        </form>
      </details>}
      <label className="block">Filter by status<select className={controls} value={filter} onChange={e => { setFilter(e.target.value); setOffset(0); }}>
        <option value="">All statuses</option>{['submitted','triage','awaiting_customer','approved','scheduled','in_service','awaiting_review','resolved','declined','cancelled'].map(s => <option key={s} value={s}>{label(s)}</option>)}
      </select></label>
      {!items.length && <p>No service requests match this view.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map(item => <button className="border rounded p-4 text-left bg-white" key={item.id} aria-pressed={selected === item.id}
          onClick={() => { setSelected(item.id); setFields({}); setError(''); setNotice(''); }}>
          <strong>{item.property_address}</strong><p>{item.pest_code} · {label(item.state)}</p>
          <p>Reported {new Date(item.reported_at).toLocaleString()}</p>
          {mode === 'staff' && <p>{item.customer_name} · {label(item.coverage)} · Response due {new Date(item.response_due_at).toLocaleString()}</p>}
          {items.filter(i => i.property_id === item.property_id).length > 1 && <p>Multiple requests for this property in this view</p>}
        </button>)}
      </div>
      <div className="flex gap-3"><button className={button} disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0,offset-25))}>Previous</button><button className={button} disabled={items.length < 25 || busy} onClick={() => setOffset(offset+25)}>Next</button><button className={button} disabled={busy} onClick={() => { void refresh().catch(e => setError(e.message)); }}>Refresh</button></div>
    </>}
    {current && <article className="border rounded p-5 space-y-4 bg-white">
      <h2 className="text-xl font-semibold">{current.pest_code} — {current.property_address}</h2>
      <p>{current.description}</p><p>Status: {label(current.state)}</p>
      {current.preferred_availability && <p>Preferred availability: {current.preferred_availability}</p>}
      {mode !== 'customer' && <><p>Coverage: {label(current.coverage)} — {current.coverage_reason}</p><p>Billing: {label(current.billing_disposition || 'pending')}</p>
        {current.source_visit && <details><summary>Previous treatment applications</summary><ul>{current.source_visit.applications.map(a => <li key={a.id}>{a.chemical_name}: {a.quantity_used} {a.unit} · {new Date(a.applied_at).toLocaleString()}</li>)}</ul>{!current.source_visit.applications.length && <p>No applications recorded.</p>}</details>}</>}
      <h3 className="font-semibold">Photos</h3>
      {current.attachments.map(a => <button className="underline mr-3" key={a.id} onClick={() => void viewPhoto(a.id)}>{a.name}</button>)}
      {!closed.includes(current.state) && <label className="block">Add photo (JPEG or PNG, up to 1 MB)<input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); }} /></label>}
      <h3 className="font-semibold">Return visits</h3>
      {!current.visits.length && <p>No return visit scheduled yet.</p>}
      {current.visits.map(v => <div className="border rounded p-3" key={v.id}><p>Visit {v.sequence} · {label(v.job_status)} · {new Date(v.scheduled_start).toLocaleString()}</p>
        {mode === 'staff' && ['draft','scheduled'].includes(v.job_status) && <>
          {choose(`tech_${v.id}`,'Assign return visit technician',(options.technicians || []).map(t => ({value:t.id,text:t.name})))}
          {field(`date_${v.id}`,'Reschedule visit (optional)',false,'datetime-local')}
          <button className={button} disabled={busy || !fields[`tech_${v.id}`]} onClick={() => void command('visit-update',{job_id:v.job_id,operation:'schedule',technician_id:fields[`tech_${v.id}`],scheduled_start:fields[`date_${v.id}`] ? new Date(fields[`date_${v.id}`]).toISOString() : null})}>Update assignment and schedule</button>
          {field(`cancel_${v.id}`,'Reason to cancel this visit')}
          <button className={button} disabled={busy || !fields[`cancel_${v.id}`]} onClick={() => void command('visit-update',{job_id:v.job_id,operation:'cancel',reason:fields[`cancel_${v.id}`]})}>Cancel visit; keep case open</button>
        </>}
        {mode === 'technician' && v.job_id === jobId && v.job_status === 'scheduled' && <button className={button} disabled={busy || !navigator.onLine} onClick={() => void command('visit-update',{job_id:v.job_id,operation:'start'})}>Start return visit</button>}
        {mode !== 'customer' && <><p>{v.summary}</p><p>Labor: {v.labor_minutes == null ? 'Not recorded' : `${v.labor_minutes} minutes`}. {v.cost_complete ? `Internal cost: $${Number(v.total_cost).toFixed(2)}` : 'Cost estimate incomplete; verify labor rate, time, and materials.'}</p></>}
        {mode === 'staff' && manager && <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); void command('visit-cost',{ job_id:v.job_id,material_cost:Number(fields[`cost_${v.id}`]) }); }}>
          {field(`cost_${v.id}`,'Verified material cost ($)',true,'number')}<button className={button} disabled={busy}>Save cost</button>
        </form>}
      </div>)}
      {mode === 'staff' && <div className="space-y-3">
        {['submitted','triage','awaiting_customer'].includes(current.state) && <>
          {choose('source_job_id','Confirm source visit',options.jobs.filter(j => j.property_id === current.property_id).map(j => ({ value:j.id,text:new Date(j.completed_at).toLocaleString() })))}
          <button className={button} disabled={busy} onClick={() => void command('assess-coverage', { source_job_id: fields.source_job_id || current.source_job_id || null })}>Assess coverage</button>
          {field('reason','Internal decision reason',true)}{field('customer_message','Explanation to customer',true)}
          {choose('billing_disposition','Return visit billing',[{value:'no_charge',text:'Covered — no charge'},{value:'goodwill',text:'Goodwill — manager approval'},{value:'quoted_paid',text:'Paid — customer quote acceptance required'}])}
          {fields.billing_disposition === 'quoted_paid' && choose('quote_id','Sent quote',(options.quotes || []).filter(q => q.property_id === current.property_id).map(q => ({value:q.id,text:`$${Number(q.total_amount).toFixed(2)} — ${q.id.slice(0,8)}`})),true)}
          {fields.billing_disposition === 'quoted_paid' && <>{field('quote_amount','New return-service quote amount ($)',false,'number')}<button className={button} disabled={busy || Number(fields.quote_amount)<=0 || !fields.quote_amount} onClick={() => void command('quotes',{total_amount:Number(fields.quote_amount)})}>Send return-service quote</button></>}
          <div className="flex gap-3 flex-wrap">{[['approve','Approve return service'],['decline','Decline request'],['request_information','Request information']].map(([decision,title]) => <button className={button} key={decision} disabled={busy || !fields.reason || !fields.customer_message} onClick={() => void command('decision',{ ...fields,decision })}>{title}</button>)}</div>
        </>}
        {['approved','awaiting_review'].includes(current.state) && <>
          {field('scheduled_start','Return visit date and time',true,'datetime-local')}{choose('technician_id','Technician (optional; can assign in dispatch)',(options.technicians || []).map(t => ({value:t.id,text:t.name})))}
          <button className={button} disabled={busy || !fields.scheduled_start} onClick={async () => { await command('visits',{ scheduled_start:new Date(fields.scheduled_start).toISOString(),technician_id:fields.technician_id || null,request_key:requestKey }); setRequestKey(crypto.randomUUID()); }}>Schedule return visit</button>
        </>}
        {current.state === 'awaiting_review' && <>{field('resolution_code','Resolution category',true)}{field('summary','Resolution summary',true)}{field('customer_message','Resolution explanation to customer',true)}
          <button className={button} disabled={busy || !fields.summary || !fields.resolution_code || !fields.customer_message} onClick={() => void command('resolution',fields)}>Resolve case</button></>}
        {current.state === 'resolved' && <>{field('reason','Reason to reopen',true)}<button className={button} disabled={busy || !fields.reason} onClick={() => void command('reopen',fields)}>Reopen case</button></>}
        {!closed.includes(current.state) && <>{field('cancel_reason','Cancellation reason')}<button className={button} disabled={busy || !fields.cancel_reason} onClick={() => void command('cancel',{ reason:fields.cancel_reason })}>Cancel request</button></>}
      </div>}
      {mode === 'customer' && current.state === 'awaiting_customer' && <>{field('message','Your reply',true)}<button className={button} disabled={busy || !fields.message} onClick={() => void command('reply',{ message:fields.message })}>Send reply</button></>}
      {mode === 'customer' && current.state === 'approved' && current.quote?.status === 'sent' && <button className={button} disabled={busy} onClick={() => void command('accept-quote')}>Accept return-service quote (${Number(current.quote.total_amount).toFixed(2)})</button>}
      {mode === 'technician' && ['scheduled','in_service'].includes(current.state) && <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        const visit = current.visits.find(v => v.job_id === jobId);
        if (!visit) return;
        const payload = { ...fields,job_id:visit.job_id,version:current.version,request_key:requestKey,follow_up:fields.resolution_code === 'follow_up_required' };
        if (!navigator.onLine && queueOutcome) {
          setBusy(true);
          try { await queueOutcome(current.id,payload); setNotice('Outcome saved on this device. Pending sync; the case is still open.'); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        } else if (await act(`/${current.id}/outcome`,payload)) setRequestKey(crypto.randomUUID());
      }}>{field('findings','Inspection findings',true)}{choose('resolution_code','Visit outcome',['treated','no_activity','access_failed','follow_up_required'].map(v => ({value:v,text:label(v)})),true)}{field('summary','Work performed and next steps',true)}<button className={button} disabled={busy}>Submit outcome for review</button></form>}
      <h3 className="font-semibold">Case timeline</h3>
      <ol className="space-y-2">{current.events.map(e => <li key={e.id}><time>{new Date(e.created_at).toLocaleString()}</time> · {label(e.action)}{e.customer_message && <p>{e.customer_message}</p>}</li>)}</ol>
    </article>}
    {mode === 'staff' && manager && settings && <details className="border rounded p-4"><summary>Warranty policy administration</summary>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act('/settings',{timezone:fields.timezone}); }}>{field('timezone','Contract date time zone (for example America/Denver)',true)}<button className={button} disabled={busy}>Save time zone</button></form>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act('/settings',{hourly_labor_rate:Number(fields.hourly_labor_rate)}); }}>{field('hourly_labor_rate','Hourly labor cost ($, applied to future visits)',true,'number')}<button className={button} disabled={busy}>Save labor rate</button></form>
      <form className="space-y-3 mt-3" onSubmit={async e => { e.preventDefault(); await act('/policies',{ name:fields.policy_name,version:Number(fields.policy_version),reporting_window_days:Number(fields.window_days),covered_pests:(fields.covered_pests || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),exclusions:fields.exclusions || '' }); }}>
        {field('policy_name','Policy name',true)}{field('policy_version','Version',true,'number')}{field('window_days','Reporting window in days from source visit completion',true,'number')}{field('covered_pests','Covered pests (comma separated)',true)}{field('exclusions','Exclusions (require manual review)')}<button className={button} disabled={busy}>Create immutable policy version</button>
      </form>
      <form className="space-y-3 mt-4" onSubmit={async e => { e.preventDefault(); await act('/policies/assign',{ policy_id:fields.policy_id,kind:fields.target_kind,target_id:fields.target_id }); }}>
        {choose('policy_id','Policy version',policies.map(p => ({value:p.id,text:`${p.name} v${p.version}`})),true)}{choose('target_kind','Assign to',[{value:'contract',text:'Contract'},{value:'job',text:'One-time service job'}],true)}{field('target_id','Contract or job ID',true)}<button className={button} disabled={busy}>Assign policy</button>
      </form>
    </details>}
  </section>;
}
