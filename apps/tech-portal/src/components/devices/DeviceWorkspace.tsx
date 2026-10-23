import {useEffect,useState} from 'react';
import {deviceApi,deviceToken,DeviceError} from './deviceApi';
import type {PropertyDevice} from './deviceApi';
interface Options{properties:{id:string;address:string;customer_name:string}[];equipment:{id:string;name:string;sku:string}[];jobs:{id:string;property_id:string;scheduled_start:string}[]}
export default function DeviceWorkspace({mode,jobId}:{mode:'staff'|'technician';jobId?:string}){
 const [token,setToken]=useState(deviceToken()),[enabled,setEnabled]=useState(false),[role,setRole]=useState('');
 const [items,setItems]=useState<PropertyDevice[]>([]),[selected,setSelected]=useState<PropertyDevice>();
 const [options,setOptions]=useState<Options>({properties:[],equipment:[],jobs:[]});
 const [property,setProperty]=useState(''),[offset,setOffset]=useState(0),[more,setMore]=useState(false),[filter,setFilter]=useState('');
 const [label,setLabel]=useState(''),[kind,setKind]=useState('bait_station'),[serial,setSerial]=useState(''),[equipment,setEquipment]=useState('');
 const [zone,setZone]=useState(''),[description,setDescription]=useState(''),[reason,setReason]=useState('');
 const [lookup,setLookup]=useState(''),[installJob,setInstallJob]=useState(''),[historical,setHistorical]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState<{path:string;body:Record<string,unknown>}>();
 useEffect(()=>{const timer=setInterval(()=>setToken(deviceToken()),2000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{setProperty('');setOffset(0);setFilter('');setLabel('');setSerial('');setEquipment('');setZone('');setDescription('');setReason('');setLookup('');setInstallJob('');setHistorical(false);},[token]);
 function fail(e:unknown){setNotice(e instanceof Error?e.message:'Device request failed');if(e instanceof DeviceError&&[401,403,404].includes(e.status)){setSelected(undefined);setItems([]);}}
 async function load(active:()=>boolean=()=>true){
  const settings=await deviceApi<{enabled:boolean;role:string}>('/settings');if(!active())return;setEnabled(settings.enabled);setRole(settings.role);
  if(!settings.enabled){setItems([]);return;}
  const q=new URLSearchParams({offset:String(offset)});if(property)q.set('property_id',property);if(jobId)q.set('job_id',jobId);if(filter)q.set('lifecycle',filter);
  const list=await deviceApi<{items:PropertyDevice[];has_more:boolean}>('/?'+q);if(!active())return;setItems(list.items);setMore(list.has_more);
  if(mode==='staff'){const value=await deviceApi<Options>('/options');if(active())setOptions(value);}
 }
 useEffect(()=>{let active=true;setSelected(undefined);setItems([]);setOptions({properties:[],equipment:[],jobs:[]});setPending(undefined);setNotice('');setEnabled(false);setBusy(true);load(()=>active).catch(e=>{if(active)fail(e);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,property,filter,offset,jobId]);
 function choose(d:PropertyDevice){setSelected(d);const l=d.locations.find(x=>x.version===d.location_version);setZone(l?.zone||'');setDescription(l?.description||'');setReason('');setLabel('');setInstallJob('');setHistorical(false);setPending(undefined);}
 async function run(path:string,body:Record<string,unknown>){
  setBusy(true);setNotice('');setPending({path,body});
  try{choose(await deviceApi<PropertyDevice>(path,body));setNotice('Saved and confirmed by the server.');await load();}
  catch(e){fail(e);if(!(e instanceof DeviceError)||e.status!==0)setPending(undefined);}finally{setBusy(false);}
 }
 const change=(action:string,extra:Record<string,unknown>={})=>selected&&run('/'+selected.id+'/'+action,{id:selected.id,version:selected.version,reason,request_key:crypto.randomUUID(),...extra});
 async function open(id:string){setBusy(true);try{const q=jobId?'?job_id='+encodeURIComponent(jobId):'';choose(await deviceApi<PropertyDevice>('/'+id+q));}catch(e){fail(e);}finally{setBusy(false);}}
 const blocked=busy||!!pending;
 return <section aria-label="Device register" className="space-y-4">
  <h2 className="text-xl font-semibold">Bait stations & devices</h2><p role="status" aria-live="polite">{busy?'Working…':notice}</p>
  {!token&&<p>Sign in through your organization to view devices.</p>}
  {token&&!enabled&&!busy&&<div><p>Device tracking is not enabled for your organization.</p>{['MANAGER','SUPER_ADMIN'].includes(role)&&<button onClick={async()=>{setBusy(true);try{await deviceApi('/settings',{enabled:true});await load();}catch(e){fail(e);}finally{setBusy(false);}}}>Enable device tracking</button>}</div>}
  {enabled&&<>
   {mode==='staff'&&<div><div><label htmlFor="property-9248">Property</label> <select id="property-9248" disabled={blocked} value={property} onChange={e=>{setProperty(e.target.value);setOffset(0);}}><option value="">All properties</option>{options.properties.map(p=><option key={p.id} value={p.id}>{p.customer_name} — {p.address}</option>)}</select></div><div><label htmlFor="lifecycle-2392">Lifecycle</label> <select id="lifecycle-2392" disabled={blocked} value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}><option value="">All devices</option>{['planned','installed','retired'].map(s=><option key={s}>{s}</option>)}</select></div></div>}
   <div><div><label htmlFor="lookup-label">Find permanent label</label> <input id="lookup-label" disabled={blocked} value={lookup} onChange={e=>setLookup(e.target.value)} /></div><button disabled={blocked||!lookup.trim()} onClick={async()=>{setBusy(true);try{const q=new URLSearchParams({label:lookup});if(jobId)q.set('job_id',jobId);choose(await deviceApi<PropertyDevice>('/lookup?'+q));}catch(e){fail(e);}finally{setBusy(false);}}}>Find device</button> <button disabled={busy} onClick={async()=>{setBusy(true);try{await load();if(selected)await open(selected.id);}catch(e){fail(e);}finally{setBusy(false);}}}>Refresh</button></div>
   {items.length===0?<p>{mode==='technician'?'No registered devices are available for this assigned job.':'No devices match this view. Select a property to register a planned device.'}</p>:<ul>{items.map(d=><li key={d.id}><button disabled={blocked} onClick={()=>open(d.id)}>{d.label} — {d.property_address} · {d.lifecycle}</button></li>)}</ul>}
   <button disabled={blocked||offset===0} onClick={()=>setOffset(o=>Math.max(0,o-25))}>Previous</button> <button disabled={blocked||!more} onClick={()=>setOffset(o=>o+25)}>Next</button>
   {mode==='staff'&&!selected&&<fieldset disabled={blocked} className="border rounded p-4 space-y-3"><legend>Register planned device</legend>
    <div><label htmlFor="perm-label">Permanent label</label> <input id="perm-label" maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} /></div>
    <div><label htmlFor="device-type-1192">Device type</label> <select id="device-type-1192" value={kind} onChange={e=>setKind(e.target.value)}>{['bait_station','trap','monitor'].map(t=><option key={t}>{t}</option>)}</select></div>
    <div><label htmlFor="mfg-serial">Manufacturer serial (optional)</label> <input id="mfg-serial" maxLength={160} value={serial} onChange={e=>setSerial(e.target.value)} /></div>
    <div><label htmlFor="equipment-item-optional-3979">Equipment item (optional)</label> <select id="equipment-item-optional-3979" value={equipment} onChange={e=>setEquipment(e.target.value)}><option value="">None</option>{options.equipment.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}</select></div>
    <div><label htmlFor="loc-zone">Location zone</label> <input id="loc-zone" maxLength={120} value={zone} onChange={e=>setZone(e.target.value)} /></div>
    <div><label htmlFor="loc-desc">Location description</label> <textarea id="loc-desc" maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)} /></div>
    <div><label htmlFor="reg-reason">Registration reason</label> <textarea id="reg-reason" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} /></div>
    <button disabled={!property||!label.trim()||!zone.trim()||!description.trim()||!reason.trim()} onClick={()=>run('/',{property_id:property,label,device_type:kind,manufacturer_serial:serial||null,equipment_item_id:equipment||null,zone,description,reason,request_key:crypto.randomUUID()})}>Register device</button>
   </fieldset>}
   {selected&&<article className="border rounded p-4 space-y-3"><h3 className="font-semibold">{selected.label} · {selected.lifecycle}</h3><p>{selected.property_address} · {selected.device_type.replace(/_/g,' ')}</p><p>Device ID: {selected.id}</p>
    {selected.lifecycle==='retired'&&<p>Retired device — do not service. Its label continues to identify this original device.</p>}
    {selected.replacement_device_id&&<p>Replacement device: {selected.replacement_device_id}</p>}{selected.replaces_device_id&&<p>Replaces device: {selected.replaces_device_id}</p>}
    {mode==='staff'&&<button disabled={blocked} onClick={()=>{setSelected(undefined);setZone('');setDescription('');setReason('');}}>Register another device</button>}
    <h4>Location history</h4><ol>{selected.locations.map(l=><li key={l.version}>Version {l.version}: {l.zone} — {l.description}{l.latitude!=null&&<span> ({l.latitude}, {l.longitude}; accuracy {l.accuracy_meters??'unknown'} m)</span>} · {l.reason}</li>)}</ol>
    {mode==='staff'&&selected.lifecycle!=='retired'&&<fieldset disabled={blocked}><legend>Manage device</legend>
     <div><label htmlFor="manage-reason">Decision reason</label> <textarea id="manage-reason" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} /></div>
     {selected.lifecycle==='planned'&&<><div><label htmlFor="installation-job-8693">Installation job</label> <select id="installation-job-8693" value={installJob} disabled={historical} onChange={e=>setInstallJob(e.target.value)}><option value="">Select an active property job</option>{options.jobs.filter(j=>j.property_id===selected.property_id).map(j=><option key={j.id} value={j.id}>{j.scheduled_start||j.id}</option>)}</select></div><label htmlFor="historical-install"><input id="historical-install" type="checkbox" checked={historical} onChange={e=>{setHistorical(e.target.checked);setInstallJob('');}} />Record an existing historical installation (actual installation date unknown)</label><button disabled={!reason.trim()||(!installJob&&!historical)} onClick={()=>change('install',{job_id:installJob||null,historical_installation:historical})}>Confirm installation</button></>}
     {selected.lifecycle==='installed'&&<><div><label htmlFor="new-loc-zone">New location zone</label> <input id="new-loc-zone" maxLength={120} value={zone} onChange={e=>setZone(e.target.value)} /></div><div><label htmlFor="new-loc-desc">New location description</label> <textarea id="new-loc-desc" maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)} /></div><button disabled={!reason.trim()||!zone.trim()||!description.trim()} onClick={()=>change('relocate',{zone,description})}>Record relocation</button><div><label htmlFor="replacement-label">Replacement permanent label</label> <input id="replacement-label" maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} /></div><button disabled={!reason.trim()||!label.trim()||!zone.trim()||!description.trim()} onClick={()=>change('replace',{label,zone,description})}>Retire and register replacement</button><p>The replacement starts as planned and needs its own installation confirmation.</p></>}
     <button disabled={!reason.trim()} onClick={()=>change('retire')}>Retire device</button>
    </fieldset>}
    <details><summary>Lifecycle history</summary><ul>{selected.events.map(e=><li key={e.id}>{e.action} · {e.reason} · {new Date(e.created_at).toLocaleString()}</li>)}</ul></details>
   </article>}
  </>}
  {pending&&!busy&&<button onClick={()=>run(pending.path,pending.body)}>Retry unconfirmed action</button>}
 </section>;
}
