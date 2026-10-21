import { useEffect, useState } from 'react';
import { inspectionApi, inspectionToken, InspectionError } from './inspectionApi';
import type { Inspection, InspectionFindings, InspectionZone } from './inspectionApi';
const empty=():InspectionFindings=>({summary:'',zones:[]});
const newZone=():InspectionZone=>({name:'',pests:[],evidence:'unknown',severity:'unknown',inaccessible:false,notes:''});
export default function InspectionWorkspace({mode,jobId}:{mode:'staff'|'technician';jobId?:string}) {
 const [token,setToken]=useState(inspectionToken());
 const [settings,setSettings]=useState<{enabled:boolean;role:string}>();
 const [items,setItems]=useState<Inspection[]>([]),[selected,setSelected]=useState<Inspection>();
 const [findings,setFindings]=useState<InspectionFindings>(empty),[dirty,setDirty]=useState(false);
 const [options,setOptions]=useState<{id:string;customer:{name:string};property:{address:string}}[]>([]);
 const [job,setJob]=useState(''),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
 const [filter,setFilter]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState<{path:string;body:Record<string,unknown>}>();
 const [photo,setPhoto]=useState<{name:string;media_type:string;data:string}>();
 useEffect(()=>{const timer=setInterval(()=>setToken(inspectionToken()),2000);return()=>clearInterval(timer);},[]);
 function choose(i?:Inspection) {setSelected(i);setFindings(i?.revisions.find(r=>r.revision===i.revision)?.findings||empty());setDirty(false);setReason('');setPhoto(undefined);setPending(undefined);}
 function fail(error:unknown) {
  const e=error instanceof Error?error:new Error('Inspection request failed');setMessage(e.message);
  if(error instanceof InspectionError && [401,403,404].includes(error.status)){choose();setItems([]);}
 }
 async function load(active:()=>boolean=()=>true) {
  const s=await inspectionApi<{enabled:boolean;role:string}>('/settings');if(!active())return;setSettings(s);
  if(!s.enabled){setItems([]);return;}
  const q=new URLSearchParams({offset:String(offset)});if(jobId)q.set('job_id',jobId);if(filter)q.set('state',filter);
  const value=await inspectionApi<{items:Inspection[];has_more:boolean}>('/?'+q);if(!active())return;setItems(value.items);setHasMore(value.has_more);
  if(mode==='staff'){const jobs=await inspectionApi<typeof options>('/options');if(active())setOptions(jobs);}
 }
 useEffect(()=>{
  let active=true;choose();setSettings(undefined);setItems([]);setMessage('');
  setBusy(true);load(()=>active).catch(e=>{if(active)fail(e);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
  // No protected data is persisted across identities; each view reloads from the server.
 },[token,jobId,filter,offset]);
 async function execute(path:string,body:Record<string,unknown>) {
  setBusy(true);setMessage('');const operation={path,body};setPending(operation);
  try {const i=await inspectionApi<Inspection>(path,body);choose(i);if(path==='/')setJob('');setMessage('Saved and confirmed by the server.');await load();return i;}
  catch(error){fail(error);if(!(error instanceof InspectionError)||error.status!==0)setPending(undefined);return undefined;}
  finally{setBusy(false);}
 }
 const change=(action:string,extra:Record<string,unknown>={})=>selected&&execute('/'+selected.id+'/'+action,{id:selected.id,version:selected.version,request_key:crypto.randomUUID(),...extra});
 function edit(zoneIndex:number,key:keyof InspectionZone,value:InspectionZone[keyof InspectionZone]) {
  setFindings(f=>({...f,zones:f.zones.map((z,index)=>index===zoneIndex?{...z,[key]:value}:z)}));setDirty(true);
 }
 async function open(i:Inspection) {setBusy(true);try{choose(await inspectionApi<Inspection>('/'+i.id));}catch(e){fail(e);}finally{setBusy(false);}}
 async function upload(file?:File) {
  if(!file||!selected)return;
  if(!['image/png','image/jpeg'].includes(file.type)||file.size>1048576){setMessage('Choose a JPEG or PNG up to 1 MB.');return;}
  setBusy(true);
  try {const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});await change('attachment',{name:file.name,media_type:file.type,data});}
  catch(e){fail(e);}finally{setBusy(false);}
 }
 const editable=selected?.state==='in_progress';
 return <section aria-label="Inspection workspace" className="space-y-4">
  <h2 className="text-xl font-semibold">{mode==='staff'?'Inspection capture & review':'Property inspection'}</h2>
  <p role="status" aria-live="polite">{busy?'Working…':message}</p>
  {!token&&<p>Sign in through your organization to view inspections.</p>}
  {settings&&!settings.enabled&&<div><p>Inspections are not enabled for your organization.</p>{['MANAGER','SUPER_ADMIN'].includes(settings.role)&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await inspectionApi('/settings',{enabled:true});await load();}catch(e){fail(e);}finally{setBusy(false);}}}>Enable inspections</button>}</div>}
  {settings?.enabled&&<>
   {mode==='staff'&&<div className="flex gap-3 flex-wrap">
    <div><label htmlFor="scheduled-job-3009">Scheduled job</label> <select id="scheduled-job-3009" value={job} disabled={busy} onChange={e=>setJob(e.target.value)}><option value="">Select a job</option>{options.map(j=><option key={j.id} value={j.id}>{j.customer.name} — {j.property.address} ({j.id.slice(0,8)})</option>)}</select></div>
    <button disabled={busy||!job} onClick={()=>execute('/',{job_id:job,request_key:crypto.randomUUID()})}>Create inspection</button>
    <div><label htmlFor="filter-7044">Filter</label> <select id="filter-7044" value={filter} disabled={busy||dirty} onChange={e=>{setOffset(0);setFilter(e.target.value);}}><option value="">All inspections</option>{['scheduled','in_progress','submitted','reviewed','cancelled'].map(s=><option key={s}>{s}</option>)}</select></div>
   </div>}
   <button disabled={busy||dirty} onClick={async()=>{setBusy(true);try{await load();if(selected)choose(await inspectionApi<Inspection>('/'+selected.id));}catch(e){fail(e);}finally{setBusy(false);}}}>Refresh</button>
   {items.length===0?<p>{mode==='technician'?'No inspection is assigned to this job.':'No inspections match this view. Select a scheduled job to create one.'}</p>:<ul>{items.map(i=><li key={i.id}><button disabled={busy||dirty} onClick={()=>open(i)}>{i.customer_name} — {i.property_address} · {i.state.replace(/_/g,' ')}</button></li>)}</ul>}
   <div><button disabled={busy||dirty||offset===0} onClick={()=>setOffset(o=>Math.max(0,o-25))}>Previous</button> <button disabled={busy||dirty||!hasMore} onClick={()=>setOffset(o=>o+25)}>Next</button></div>
   {selected&&<article className="border rounded p-4 space-y-3">
    <h3 className="font-semibold">{selected.property_address} · revision {selected.revision}</h3><p>Inspection: {selected.state.replace(/_/g,' ')} · Job: {selected.job_status.replace(/_/g,' ')}</p>
    {selected.state==='scheduled'&&<button disabled={busy} onClick={()=>change('start')}>Begin inspection</button>}
    <fieldset disabled={busy||!!pending||!editable} className="space-y-3">
     <div><label htmlFor="findings-summary">Findings summary</label> <textarea id="findings-summary" value={findings.summary} maxLength={10000} onChange={e=>{setFindings(f=>({...f,summary:e.target.value}));setDirty(true);}} /></div>
     {findings.zones.map((z,index)=><fieldset key={index} className="border rounded p-3"><legend>Zone {index+1}</legend>
      <div><label htmlFor={`zone-name-${index}`}>Zone name</label> <input id={`zone-name-${index}`} value={z.name} maxLength={120} onChange={e=>edit(index,'name',e.target.value)} /></div>
      <div><label htmlFor={`zone-pests-${index}`}>Pests (comma separated)</label> <input id={`zone-pests-${index}`} value={z.pests.join(', ')} onChange={e=>edit(index,'pests',e.target.value.split(',').map(x=>x.trim()))} /></div>
      <div><label htmlFor={`evidence-9644-${index}`}>Evidence</label> <select id={`evidence-9644-${index}`} value={z.evidence} onChange={e=>edit(index,'evidence',e.target.value)}>{['unknown','observed','reported','none'].map(x=><option key={x}>{x}</option>)}</select></div>
      <div><label htmlFor={`severity-7645-${index}`}>Severity</label> <select id={`severity-7645-${index}`} value={z.severity} onChange={e=>edit(index,'severity',e.target.value)}>{['unknown','low','moderate','high'].map(x=><option key={x}>{x}</option>)}</select></div>
      <div><label htmlFor={`zone-inaccessible-${index}`}><input id={`zone-inaccessible-${index}`} type="checkbox" checked={z.inaccessible} onChange={e=>edit(index,'inaccessible',e.target.checked)} /> Inaccessible area</label></div>
      <div><label htmlFor={`zone-notes-${index}`}>Observations, conditions, concerns or access reason</label> <textarea id={`zone-notes-${index}`} value={z.notes} maxLength={4000} onChange={e=>edit(index,'notes',e.target.value)} /></div>
      <button onClick={()=>{setFindings(f=>({...f,zones:f.zones.filter((_,n)=>n!==index)}));setDirty(true);}}>Remove zone {index+1}</button>
     </fieldset>)}
     <button disabled={busy||findings.zones.length>=50} onClick={()=>{setFindings(f=>({...f,zones:[...f.zones,newZone()]}));setDirty(true);}}>Add zone</button>
     <button onClick={()=>change('save',{findings:{...findings,zones:findings.zones.map(z=>({...z,pests:z.pests.filter(Boolean)}))}})}>Save draft</button>
    </fieldset>
    {editable&&<><p>{dirty?'You have unsaved findings. Save the draft before submitting or adding photos.':'Draft saved. Submission preserves these findings for staff review.'}</p><div><label htmlFor="add-photo">Add photo</label> <input id="add-photo" type="file" accept="image/jpeg,image/png" disabled={busy||dirty} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}} /></div><button disabled={busy||dirty} onClick={()=>change('submit')}>Submit for review</button></>}
    {mode==='staff'&&selected.state==='submitted'&&<div><div><label htmlFor="review-reason">Review reason</label> <textarea id="review-reason" value={reason} maxLength={4000} onChange={e=>setReason(e.target.value)} /></div><button disabled={busy||!!pending||!reason.trim()} onClick={()=>change('review',{decision:'reviewed',reason})}>Approve findings</button> <button disabled={busy||!!pending||!reason.trim()||['completed','invoiced','cancelled'].includes(selected.job_status)} onClick={()=>change('review',{decision:'revision_requested',reason})}>Request revision</button>{['completed','invoiced','cancelled'].includes(selected.job_status)&&<p>Schedule a new inspection visit if additional findings are needed for this closed job.</p>}</div>}
    {mode==='staff'&&!['reviewed','cancelled'].includes(selected.state)&&<div><div><label htmlFor="cancel-reason">Cancellation reason</label> <input id="cancel-reason" value={reason} onChange={e=>setReason(e.target.value)} /></div><button disabled={busy||!reason.trim()} onClick={()=>change('cancel',{reason})}>Cancel inspection</button></div>}
    <h4>Inspection photos</h4>{selected.attachments.length===0?<p>No photos attached.</p>:<ul>{selected.attachments.map(a=><li key={a.id}><button disabled={busy} onClick={async()=>{setBusy(true);try{setPhoto(await inspectionApi('/'+selected.id+'/attachments/'+a.id));}catch(e){fail(e);}finally{setBusy(false);}}}>{a.name} · revision {a.revision}</button></li>)}</ul>}
    {photo&&<figure><img alt={photo.name} src={'data:'+photo.media_type+';base64,'+photo.data} style={{maxWidth:'100%',maxHeight:320}}/><figcaption>{photo.name}</figcaption></figure>}
    <details><summary>Revision history</summary>{selected.revisions.map(r=><div key={r.revision}><h4>Revision {r.revision}{r.submitted_at?' · submitted':''}</h4><p>{r.findings.summary}</p><ul>{r.findings.zones.map((z,n)=><li key={n}>{z.name}: {z.evidence}, {z.severity}{z.inaccessible?', inaccessible':''} — {z.notes}</li>)}</ul>{r.review_reason&&<p>Staff review: {r.review_reason}</p>}</div>)}</details>
   </article>}
  </>}
  {pending&&!busy&&<button onClick={()=>execute(pending.path,pending.body)}>Retry unconfirmed action</button>}
 </section>;
}
