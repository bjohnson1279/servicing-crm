export interface PlaybookTask {
  id: string;
  label: string;
  required: boolean;
  response_type?: string;
}

export interface PlaybookRun {
  id: string;
  job_id: string;
  property_id: string;
  property_address?: string;
  customer_name?: string;
  checklist_version_id: string;
  checklist_title?: string;
  state: 'pending_ack' | 'in_progress' | 'submitted' | 'reviewed';
  version: number;
  brief_snapshot: {
    access_instructions: string;
    known_hazards?: string;
    pets_notes?: string;
    pest_concerns?: string;
    service_zones?: string[];
    brief_version?: number;
  };
  checklist_snapshot: PlaybookTask[];
  acknowledged_at?: string;
  responses: Record<string, string>;
  exceptions: Record<string, string>;
  observations: string;
  follow_up_flagged: boolean;
  review_notes?: string;
  events: { id: string; action: string; created_at: string }[];
}

export const playbookToken = () => sessionStorage.getItem('crm_access_token');
export class PlaybookError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const base = ((import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '') + '/playbooks';

export async function playbookApi<T>(path: string, body?: unknown): Promise<T> {
  const token = playbookToken();
  if (!token) throw new PlaybookError(401, 'Sign in through your organization to view playbooks.');
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PlaybookError(0, 'Connection interrupted. Your action is not confirmed; retry when connected.');
  }
  if (playbookToken() !== token) throw new PlaybookError(401, 'Your session changed. Reload playbooks.');
  let value: any;
  try {
    value = await response.json();
  } catch {
    throw new PlaybookError(0, 'Response could not be confirmed. Retry the same action.');
  }
  if (!response.ok) throw new PlaybookError(response.status, value.error || value.detail || 'Playbook request failed.');
  return value as T;
}
