import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../.callback-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import {testInspectionAdapters} from './inspection-adapters.mjs';
const db=new PGlite(),root=new URL('../shared/database/',import.meta.url);
for(const name of (await readdir(root)).filter(n=>n.endsWith('.sql')).sort()) {
 if(name==='003_seed_data.sql')continue;
 try{await db.exec((await readFile(new URL(name,root),'utf8')).replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g,'').replace(/uuid_generate_v4\(\)/g,'gen_random_uuid()'));}catch(e){console.error(name,e.message);throw e;}
}
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const tenant=id(1),other=id(2),manager=id(3),techUser=id(4),techUser2=id(5),customerUser=id(6),customer=id(7),property=id(8),tech=id(9),tech2=id(10),job=id(11);
await db.query("INSERT INTO tenants(id,name) VALUES($1,'One'),($2,'Two')",[tenant,other]);
for(const [user,role,t] of [[manager,'MANAGER',tenant],[techUser,'TECHNICIAN',tenant],[techUser2,'TECHNICIAN',tenant],[customerUser,'CUSTOMER',tenant],[id(12),'MANAGER',other]])await db.query("INSERT INTO users(id,tenant_id,email,password_hash,role) VALUES($1,$2,$3,'x',$4)",[user,t,user+'@test',role]);
await db.query("INSERT INTO customers(id,user_id,name) VALUES($1,$2,'Client')",[customer,customerUser]);
await db.query("INSERT INTO properties(id,customer_id,address) VALUES($1,$2,'Place')",[property,customer]);
await db.query('INSERT INTO technicians(id,user_id) VALUES($1,$2),($3,$4)',[tech,techUser,tech2,techUser2]);
await db.query("INSERT INTO jobs(id,tenant_id,customer_id,property_id,technician_id,status) VALUES($1,$2,$3,$4,$5,'scheduled')",[job,tenant,customer,property,tech]);
let checks=0;
async function api(action,body={},actor=manager,t=tenant){return (await db.query('SELECT inspection_api($1,$2::uuid,$3::uuid,$4::jsonb) AS value',[action,t,actor,JSON.stringify(body)])).rows[0].value;}
async function jobApi(action,body={},actor=manager){return (await db.query('SELECT job_api($1,$2::uuid,$3::uuid,$4::jsonb) AS value',[action,tenant,actor,JSON.stringify(body)])).rows[0].value;}
const key=()=>crypto.randomUUID();
function eq(a,b){assert.deepEqual(a,b);checks++;}
async function denied(action,body,code,actor=techUser,t=tenant){await assert.rejects(api(action,body,actor,t),e=>e.code===code);checks++;}
await denied('list',{},'P0503');
await denied('settings',{enabled:true},'P0403');
await denied('settings',{},'P0403',customerUser);
eq((await api('settings',{enabled:true})).enabled,true);
await denied('create',{job_id:job,request_key:key()},'P0403');
const create={job_id:job,request_key:key()};let i=await api('create',create);
eq(i.state,'scheduled');eq((await api('create',create)).id,i.id);
await denied('create',{...create,request_key:key()},'P0409',manager);
await denied('create',{job_id:id(99),request_key:key()},'P0404',manager);
eq((await api('list',{},techUser)).items.length,1);
eq((await api('list',{},techUser2)).items.length,0);
await api('settings',{enabled:true},id(12),other);
eq((await api('list',{},id(12),other)).items.length,0);
await denied('get',{id:i.id},'P0404',id(12),other);
await denied('get',{id:i.id},'P0404',techUser2);
await assert.rejects(jobApi('update',{id:job,status:'completed'}),e=>e.code==='P0409');checks++;
async function mutate(action,extra={},actor=techUser){i=await api(action,{id:i.id,version:i.version,request_key:key(),...extra},actor);return i;}
await mutate('start');eq(i.job_status,'in_progress');
await denied('save',{id:i.id,version:1,request_key:key(),findings:{}},'P0409');
await denied('submit',{id:i.id,version:i.version,request_key:key()},'P0400');
const findings={summary:'Activity in kitchen',zones:[{name:'Kitchen',pests:['ants'],evidence:'observed',severity:'moderate',inaccessible:false,notes:'Trail near window. Seal gap.'}]};
await mutate('save',{findings});eq(i.revisions[0].findings,findings);
await denied('save',{id:i.id,version:i.version,request_key:key(),findings:{summary:'Malformed',zones:[123]}},'P0400');
const image=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
await denied('attachment',{id:i.id,version:i.version,request_key:key(),name:'bad',media_type:'text/html',data:image},'P0400');
await mutate('attachment',{name:'Kitchen.png',media_type:'image/png',data:image});eq(i.attachments.length,1);
eq((await api('attachment_get',{id:i.id,attachment_id:i.attachments[0].id},techUser)).data.replace(/\s/g,''),image);
await denied('attachment_get',{id:i.id,attachment_id:i.attachments[0].id},'P0404',techUser2);
const submit={id:i.id,version:i.version,request_key:key()};i=await api('submit',submit,techUser);eq(i.state,'submitted');
eq((await api('submit',submit,techUser)).version,i.version);
await assert.rejects(db.query("UPDATE inspection_revisions SET findings='{}' WHERE inspection_id=$1 AND revision=1",[i.id]),e=>e.code==='P0409');checks++;
await assert.rejects(db.query('DELETE FROM inspection_revisions WHERE inspection_id=$1 AND revision=1',[i.id]),e=>e.code==='P0409');checks++;
await denied('submit',{...submit,version:i.version},'P0409');
await denied('save',{id:i.id,version:i.version,request_key:key(),findings},'P0409');
await denied('review',{id:i.id,version:i.version,request_key:key(),decision:'reviewed',reason:'Complete'},'P0403');
await mutate('review',{decision:'revision_requested',reason:'Add pantry access information'},manager);
eq(i.revision,2);eq(i.revisions[0].findings,findings);eq(i.revisions[0].review_reason,'Add pantry access information');
eq(i.attachments[0].revision,1);
await jobApi('update',{id:job,technician_id:tech2});
await denied('get',{id:i.id},'P0404');
await denied('submit',submit,'P0404');
await mutate('save',{findings:{...findings,summary:'Pantry included'}},techUser2);
await mutate('submit',{},techUser2);
await mutate('review',{decision:'reviewed',reason:'Findings complete'},manager);eq(i.state,'reviewed');
eq(i.revisions[0].findings,findings);eq(i.revisions[1].submitted_by,techUser2);
eq((await jobApi('clock_out',{id:job},techUser2)).status,'completed');
await denied('save',{id:i.id,version:i.version,request_key:key(),findings},'P0409',techUser2);
await db.query("UPDATE users SET role='CUSTOMER' WHERE id=$1",[techUser2]);
await denied('get',{id:i.id},'P0403',techUser2);
console.log(checks+' inspection database checks passed');
await testInspectionAdapters(db,{tenant,manager,techUser,customerUser,inspection:i.id,job,photo:i.attachments[0].id,version:i.version});
await db.close();
