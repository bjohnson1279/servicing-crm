export const callbackBase = ((import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '') + '/callbacks';
export const callbackToken = () => sessionStorage.getItem('crm_access_token');
export async function watchCallbacks(signal: AbortSignal, changed: () => void) {
  const token = callbackToken();
  if (!token || !navigator.onLine) return;
  const response = await fetch(callbackBase + '/events', { headers:{ Authorization:`Bearer ${token}` },signal });
  if (!response.ok || !response.body) return;
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  try {
    while (!signal.aborted) {
      const { done,value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value,{stream:true});
      let index: number;
      while ((index=buffer.indexOf('\n\n'))>=0) {
        const event=buffer.slice(0,index); buffer=buffer.slice(index+2);
        if (event.startsWith('event: callbacks')) changed();
      }
    }
  } finally { reader.releaseLock(); }
}
export class CallbackHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function callbackApi<T>(path: string, body?: unknown): Promise<T> {
  const token = callbackToken();
  if (!token) throw new CallbackHttpError(401, 'Sign in through your organization to use service requests.');
  const raw = token.split('.')[1]?.replace(/-/g,'+').replace(/_/g,'/');
  let identity = '';
  try { const claims = JSON.parse(atob(raw)); identity = `${claims.tenantId}:${claims.id}`; } catch { /* server verifies */ }
  const cacheKey = `callback-cache:${identity}:${callbackBase}:${path}`;
  if (body === undefined && !navigator.onLine && identity) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as T;
  }
  const response = await fetch(callbackBase + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new CallbackHttpError(response.status, data.error || data.detail || 'Service request failed');
  if (body === undefined && identity) sessionStorage.setItem(cacheKey,JSON.stringify(data));
  return data as T;
}
export interface CallbackVisit {
  id: string; job_id: string; sequence: number; job_status: string; scheduled_start: string;
  findings?: string; summary?: string; resolution_code?: string; outcome_at?: string;
  labor_minutes?: number; follow_up?: boolean;
  labor_cost?: number; material_cost?: number; total_cost?: number; cost_complete?: boolean;
}
export interface CallbackCase {
  id: string; property_id: string; customer_id: string; property_address: string; customer_name: string;
  pest_code: string; description: string; preferred_availability: string; source_job_id?: string;
  state: string; coverage: string; coverage_reason?: string; billing_disposition?: string;
  reported_at: string; response_due_at: string; version: number;
  events: { id: string; action: string; customer_message?: string; created_at: string }[];
  visits: CallbackVisit[];
  attachments: { id: string; name: string }[];
  quote?: { id: string; total_amount: number; status: string };
  source_visit?: { id: string; applications: { id: string; chemical_name: string; quantity_used: number; unit: string; applied_at: string }[] };
}
