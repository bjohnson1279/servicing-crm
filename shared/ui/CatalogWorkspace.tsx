import {useEffect,useState} from 'react';
import {catalogApi,catalogToken,CatalogError} from './catalogApi';
import type {CatalogData,CatalogProduct,CatalogDocument} from './catalogApi';
const empty=():CatalogData=>({trade_name:'',manufacturer:'',category:'pesticide',jurisdiction:'',identifier_status:'unknown',identifier_type:'',identifier_value:'',identifier_reason:'',label_required:true,sds_required:true,document_exception:'',inventory_item_id:null});
const noChecks=()=>({identity_matches:false,identifier_matches:false,jurisdiction_matches:false,documents_current:false});
const localNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
export default function CatalogWorkspace({mode,jobId}:{mode:'staff'|'technician';jobId?:string}){
 const [token,setToken]=useState(catalogToken()),[enabled,setEnabled]=useState(false),[role,setRole]=useState('');
 const [items,setItems]=useState<CatalogProduct[]>([]),[product,setProduct]=useState<CatalogProduct>(),[revision,setRevision]=useState(1);
 const [data,setData]=useState<CatalogData>(empty),[code,setCode]=useState(''),[reason,setReason]=useState(''),[dirty,setDirty]=useState(false);
 const [options,setOptions]=useState<{id:string;name:string;sku:string}[]>([]),[filter,setFilter]=useState(''),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
 const [checks,setChecks]=useState(noChecks),[reviewDue,setReviewDue]=useState('');
 const [docType,setDocType]=useState('label'),[docName,setDocName]=useState(''),[sourceKind,setSourceKind]=useState('manufacturer'),[authority,setAuthority]=useState(''),[sourceUrl,setSourceUrl]=useState(''),[sourceDate,setSourceDate]=useState(''),[dateReason,setDateReason]=useState(''),[retrieved,setRetrieved]=useState(localNow),[file,setFile]=useState<File>();
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState<{path:string;body:Record<string,unknown>}>();
 const current=product?.versions.find(v=>v.revision===revision),manager=['MANAGER','SUPER_ADMIN'].includes(role),blocked=busy||!!pending;
 const editable=mode==='staff'&&(!product||current?.status==='draft');
 useEffect(()=>{const timer=setInterval(()=>setToken(catalogToken()),2000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{setCode('');setData(empty());setReason('');setProduct(undefined);setDirty(false);setDocName('');setAuthority('');setSourceUrl('');setSourceDate('');setDateReason('');setFile(undefined);setChecks(noChecks());setReviewDue('');setOffset(0);setFilter('');},[token]);
 function fail(e:unknown){setNotice(e instanceof Error?e.message:'Catalog request failed');if(e instanceof CatalogError&&[401,403,404].includes(e.status)){setProduct(undefined);setItems([]);setData(empty());setDirty(false);}}
 async function load(active:()=>boolean=()=>true){
  const s=await catalogApi<{enabled:boolean;role:string}>('/settings');if(!active())return;setEnabled(s.enabled);setRole(s.role);if(!s.enabled){setItems([]);return;}
  const q=new URLSearchParams({offset:String(offset)});if(jobId)q.set('job_id',jobId);if(filter)q.set('status',filter);
  const value=await catalogApi<{items:CatalogProduct[];has_more:boolean}>('/?'+q);if(!active())return;setItems(value.items);setMore(value.has_more);
  if(mode==='staff'){const choices=await catalogApi<typeof options>('/options');if(active())setOptions(choices);}
 }
 useEffect(()=>{let active=true;setProduct(undefined);setItems([]);setEnabled(false);setPending(undefined);setNotice('');setBusy(true);load(()=>active).catch(e=>{if(active)fail(e);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,jobId,filter,offset]);
 function choose(p:CatalogProduct,rev=p.versions[p.versions.length-1]?.revision||1){setProduct(p);setRevision(rev);setData(p.versions.find(v=>v.revision===rev)?.data||empty());setReason('');setDirty(false);setPending(undefined);setChecks(noChecks());setReviewDue('');setFile(undefined);}
 async function open(id:string){setBusy(true);try{choose(await catalogApi<CatalogProduct>('/'+id+(jobId?'?job_id='+encodeURIComponent(jobId):'')));}catch(e){fail(e);}finally{setBusy(false);}}
 async function run(path:string,body:Record<string,unknown>){
  setBusy(true);setNotice('');setPending({path,body});
  try{choose(await catalogApi<CatalogProduct>(path,body));setNotice('Saved and confirmed by the server.');await load();}
  catch(e){fail(e);if(!(e instanceof CatalogError)||e.status!==0)setPending(undefined);}finally{setBusy(false);}
 }
 const change=(action:string,extra:Record<string,unknown>={})=>product&&current&&run('/'+product.id+'/'+action,{id:product.id,revision:current.revision,version:current.version,reason,request_key:crypto.randomUUID(),...extra});
 function edit<K extends keyof CatalogData>(key:K,value:CatalogData[K]){setData(d=>({...d,[key]:value}));setDirty(true);}
 async function addDocument(){
  setBusy(true);try{
   let encoded:string|undefined;
   if(file){if(file.type!=='application/pdf'||file.size>2097152)throw new Error('Choose a PDF up to 2 MB.');encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});}
   await change('document',{document_type:docType,name:docName,source_kind:sourceKind,source_authority:authority,source_url:sourceUrl.trim()||null,source_date:sourceDate||null,unknown_date_reason:dateReason,retrieved_at:new Date(retrieved).toISOString(),...(encoded?{data:encoded}:{})});
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 async function download(d:CatalogDocument){
  if(!product)return;setBusy(true);try{
   const value=await catalogApi<{data:string|null;name:string}>('/'+product.id+'/documents/'+d.id+(jobId?'?job_id='+encodeURIComponent(jobId):''));
   if(!value.data){setNotice('This evidence is a source reference. Use its source link.');return;}
   const binary=atob(value.data.replace(/\s/g,'')),buffer=new ArrayBuffer(binary.length),bytes=new Uint8Array(buffer);for(let n=0;n<binary.length;n++)bytes[n]=binary.charCodeAt(n);
   const url=URL.createObjectURL(new Blob([buffer],{type:'application/pdf'})),anchor=document.createElement('a');anchor.href=url;anchor.download=value.name.replace(/[\\/]/g,'_')+'.pdf';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 return <section aria-label="Product catalog" className="space-y-4">
  <h2 className="text-xl font-semibold">{mode==='staff'?'Product catalog & source review':'Reviewed product references'}</h2>
  <p>Review records document a staff check of product sources. A catalog entry does not authorize a particular application or make a blanket safety claim.</p>
  <p role="status" aria-live="polite">{busy?'Working…':notice}</p>
  {!token&&<p>Sign in through your organization to view product references.</p>}
  {token&&!enabled&&!busy&&<div><p>The product catalog is not enabled for your organization.</p>{manager&&<button onClick={async()=>{setBusy(true);try{await catalogApi('/settings',{enabled:true});await load();}catch(e){fail(e);}finally{setBusy(false);}}}>Enable product catalog</button>}</div>}
  {enabled&&<>
   {mode==='staff'&&<label>Version status <select disabled={blocked||dirty} value={filter} onChange={e=>{setOffset(0);setFilter(e.target.value);}}><option value="">All versions</option>{['draft','in_review','active','rejected','superseded','withdrawn'].map(s=><option key={s}>{s}</option>)}</select></label>}
   <button disabled={busy||dirty} onClick={async()=>{setBusy(true);try{await load();if(product)await open(product.id);}catch(e){fail(e);}finally{setBusy(false);}}}>Refresh</button>
   {items.length===0?<p>{mode==='staff'?'No products match this view. Create a draft with source-backed product details.':'No active, review-current product references are available for this assigned job.'}</p>:<ul>{items.map(p=><li key={p.id}><button disabled={blocked||dirty} onClick={()=>open(p.id)}>{p.code} — {p.versions[p.versions.length-1]?.data.trade_name}</button></li>)}</ul>}
   <button disabled={blocked||dirty||offset===0} onClick={()=>setOffset(o=>Math.max(0,o-25))}>Previous</button> <button disabled={blocked||dirty||!more} onClick={()=>setOffset(o=>o+25)}>Next</button>
   {product&&<div><h3 className="font-semibold">{product.code}</h3><label>Product version <select disabled={blocked||dirty} value={revision} onChange={e=>choose(product,Number(e.target.value))}>{product.versions.map(v=><option key={v.revision} value={v.revision}>{v.revision} · {v.status.replace(/_/g,' ')}</option>)}</select></label>
    {current&&<p>Status: {current.status.replace(/_/g,' ')}{current.verified_at?' · reviewed '+new Date(current.verified_at).toLocaleString():''}{current.review_due_at?' · review due '+new Date(current.review_due_at).toLocaleString():''}</p>}
    {mode==='staff'&&<button disabled={blocked||dirty} onClick={()=>{setProduct(undefined);setData(empty());setCode('');setReason('');setDirty(false);}}>New product draft</button>}
   </div>}
   {(mode==='staff'||product)&&<fieldset disabled={blocked||!editable} className="border rounded p-4 space-y-3"><legend>{editable?'Product details':'Product reference'}</legend>
    {!product&&<label>Permanent product code <input maxLength={80} value={code} onChange={e=>setCode(e.target.value)} /></label>}
    <label>Trade name <input maxLength={160} value={data.trade_name} onChange={e=>edit('trade_name',e.target.value)} /></label>
    <label>Manufacturer <input maxLength={160} value={data.manufacturer} onChange={e=>edit('manufacturer',e.target.value)} /></label>
    <label>Category <select value={data.category} onChange={e=>{edit('category',e.target.value);if(e.target.value==='pesticide'){edit('label_required',true);edit('sds_required',true);}}}><option value="pesticide">Pesticide</option><option value="non_pesticide">Other product</option></select></label>
    <label>Jurisdiction <input maxLength={160} value={data.jurisdiction} onChange={e=>edit('jurisdiction',e.target.value)} /></label>
    <label>Identifier status <select value={data.identifier_status} onChange={e=>{edit('identifier_status',e.target.value);if(e.target.value!=='known')edit('identifier_value','');}}><option value="unknown">Unknown — needs review</option><option value="known">Known from source</option>{data.category==='non_pesticide'&&<option value="not_applicable">Not applicable</option>}</select></label>
    {data.identifier_status==='known'?<><label>Identifier type <input maxLength={80} value={data.identifier_type} onChange={e=>edit('identifier_type',e.target.value)} /></label><label>Identifier value <input maxLength={160} value={data.identifier_value} onChange={e=>edit('identifier_value',e.target.value)} /></label></>:<label>Identifier explanation <textarea maxLength={2000} value={data.identifier_reason} onChange={e=>edit('identifier_reason',e.target.value)} /></label>}
    <label><input type="checkbox" checked={data.label_required} disabled={data.category==='pesticide'} onChange={e=>edit('label_required',e.target.checked)} />Label evidence required</label>
    <label><input type="checkbox" checked={data.sds_required} disabled={data.category==='pesticide'} onChange={e=>edit('sds_required',e.target.checked)} />SDS evidence required</label>
    {(!data.label_required||!data.sds_required)&&<label>Not-applicable document explanation <textarea maxLength={2000} value={data.document_exception} onChange={e=>edit('document_exception',e.target.value)} /></label>}
    {mode==='staff'&&<label>Inventory reference (optional) <select value={data.inventory_item_id||''} onChange={e=>edit('inventory_item_id',e.target.value||null)}><option value="">None</option>{options.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}</select></label>}
   </fieldset>}
   {mode==='staff'&&<label>Action reason <textarea disabled={blocked} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} /></label>}
   {mode==='staff'&&!product&&<button disabled={blocked||!code.trim()||!reason.trim()} onClick={()=>run('/',{code,data,reason,request_key:crypto.randomUUID()})}>Create product draft</button>}
   {product&&current&&<>
    {editable&&<><button disabled={blocked||!reason.trim()} onClick={()=>change('save',{data})}>Save draft</button><button disabled={blocked||dirty||!reason.trim()} onClick={()=>change('submit')}>Submit source review</button><p>{dirty?'Save changed product details before adding evidence or submitting.':'Product details are saved.'}</p></>}
    <h4>Source evidence</h4>{current.documents.length===0?<p>No source evidence attached.</p>:<ul>{current.documents.map(d=><li key={d.id}>{d.name} · {d.document_type} · {d.source_authority} · {d.source_date||'Document date unknown'}{d.source_url&&<> · <a href={d.source_url} target="_blank" rel="noopener noreferrer">Open source reference</a></>}{d.sha256&&<> · <button disabled={busy} onClick={()=>download(d)}>Download {d.name}</button></>}{editable&&<button disabled={blocked||dirty||!reason.trim()} onClick={()=>change('remove_document',{document_id:d.id})}>Remove {d.name}</button>}</li>)}</ul>}
    {editable&&<fieldset disabled={blocked||dirty} className="border rounded p-3"><legend>Add source evidence</legend>
     <label>Document type <select value={docType} onChange={e=>setDocType(e.target.value)}>{['label','sds','other'].map(t=><option key={t}>{t}</option>)}</select></label>
     <label>Document name <input maxLength={160} value={docName} onChange={e=>setDocName(e.target.value)} /></label>
     <label>Source kind <select value={sourceKind} onChange={e=>setSourceKind(e.target.value)}>{['manufacturer','regulator','other'].map(t=><option key={t}>{t}</option>)}</select></label>
     <label>Source authority <input maxLength={160} value={authority} onChange={e=>setAuthority(e.target.value)} /></label>
     <label>HTTPS source URL (optional with PDF) <input type="url" maxLength={2048} value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} /></label>
     <label>PDF copy (optional with source URL) <input key={product.id+':'+revision+':'+current.version} type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0])} /></label>
     <label>Document date (if known) <input type="date" value={sourceDate} onChange={e=>setSourceDate(e.target.value)} /></label>
     {!sourceDate&&<label>Unknown document date reason <input maxLength={1000} value={dateReason} onChange={e=>setDateReason(e.target.value)} /></label>}
     <label>Source retrieved at <input type="datetime-local" value={retrieved} onChange={e=>setRetrieved(e.target.value)} /></label>
     <button disabled={!reason.trim()||!docName.trim()||!authority.trim()||(!sourceUrl.trim()&&!file)||(!sourceDate&&!dateReason.trim())||!retrieved} onClick={addDocument}>Add document</button>
    </fieldset>}
    {mode==='staff'&&manager&&current.status==='in_review'&&<fieldset disabled={blocked}><legend>Manager source verification</legend>
     {Object.entries({identity_matches:'Trade name and manufacturer match the sources',identifier_matches:'Identifier or not-applicable status matches the sources',jurisdiction_matches:'Jurisdiction matches the evidence reviewed',documents_current:'Required source documents are current and reviewed'}).map(([k,label])=><label key={k}><input type="checkbox" checked={checks[k as keyof typeof checks]} onChange={e=>setChecks(c=>({...c,[k]:e.target.checked}))}/>{label}</label>)}
     <label>Next source review due <input type="datetime-local" value={reviewDue} onChange={e=>setReviewDue(e.target.value)} /></label>
     <button disabled={!reason.trim()||!Object.values(checks).every(Boolean)||!reviewDue} onClick={()=>{try{void change('activate',{checks,review_due_at:new Date(reviewDue).toISOString()});}catch(e){fail(e);}}}>Activate reviewed version</button>
     <button disabled={!reason.trim()} onClick={()=>change('reject')}>Reject source review</button>
    </fieldset>}
    {mode==='staff'&&current.status==='active'&&manager&&<button disabled={blocked||!reason.trim()} onClick={()=>change('withdraw')}>Withdraw active version</button>}
    {mode==='staff'&&!['draft','in_review'].includes(current.status)&&<button disabled={blocked||!reason.trim()} onClick={()=>change('next_version')}>Create successor draft</button>}
    {mode==='staff'&&<details><summary>Catalog review history</summary><ul>{product.events.map(e=><li key={e.id}>{e.action} · {e.reason} · {new Date(e.created_at).toLocaleString()}</li>)}</ul></details>}
   </>}
  </>}
  {pending&&!busy&&<button onClick={()=>run(pending.path,pending.body)}>Retry unconfirmed action</button>}
 </section>;
}
