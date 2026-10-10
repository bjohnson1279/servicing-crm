import { beforeEach, expect, it, vi } from 'vitest';
import { callbackApi, callbackToken, CallbackHttpError } from './components/callbacks/callbackApi';
import { queueCallbackOutcome, syncCallbackOutcomes, callbackDrafts } from './callbackOfflineQueue';

const records=vi.hoisted(()=>new Map<string,any>());
vi.mock('idb',()=>({openDB:vi.fn().mockImplementation(async()=>({
  put:async (_:string,entry:any)=>records.set(entry.key,entry),
  getAll:async()=>Array.from(records.values()), get:async(_:string,key:string)=>records.get(key),
  delete:async(_:string,key:string)=>records.delete(key),
}))}));
vi.mock('./components/callbacks/callbackApi',async()=>{
  const actual=await vi.importActual<typeof import('./components/callbacks/callbackApi')>('./components/callbacks/callbackApi');
  return {...actual,callbackApi:vi.fn(),callbackToken:vi.fn()};
});
const token=(id:string)=>'header.'+btoa(JSON.stringify({id,tenantId:'tenant-1'}))+'.signature';
beforeEach(()=>{
  records.clear(); vi.mocked(callbackApi).mockReset();
  vi.mocked(callbackToken).mockReturnValue(token('tech-1'));
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
});
it('retries with the saved key and only removes a draft after success',async()=>{
  const body={job_id:'job-1',request_key:'key-1',version:2,findings:'Ant trail',summary:'Treated'};
  await queueCallbackOutcome('case-1',body);
  expect(records.size).toBe(1);
  vi.mocked(callbackApi).mockResolvedValue({});
  await syncCallbackOutcomes();
  expect(callbackApi).toHaveBeenCalledWith('/case-1/outcome',body);expect(records.size).toBe(0);
});
it('retains conflicts for explicit review',async()=>{
  await queueCallbackOutcome('case-1',{job_id:'job-1',request_key:'key-1',version:2});
  vi.mocked(callbackApi).mockRejectedValue(new CallbackHttpError(409,'Refresh case'));
  await syncCallbackOutcomes();
  expect((await callbackDrafts('job-1'))[0].status).toBe('needs_review');
  expect(records.size).toBe(1);
});
it('retains drafts on transient failures',async()=>{
  await queueCallbackOutcome('case-1',{job_id:'job-1',request_key:'key-1',version:2});
  vi.mocked(callbackApi).mockRejectedValue(new TypeError('Network failed'));
  await syncCallbackOutcomes();expect(records.get('key-1').status).toBe('pending');
});
it('does not send another signed identity’s saved outcome',async()=>{
  await queueCallbackOutcome('case-1',{job_id:'job-1',request_key:'key-1',version:2});
  vi.mocked(callbackToken).mockReturnValue(token('tech-2'));
  await syncCallbackOutcomes();expect(callbackApi).not.toHaveBeenCalled();expect(records.size).toBe(1);
});
