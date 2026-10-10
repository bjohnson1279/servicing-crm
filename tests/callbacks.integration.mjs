import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../.callback-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import { testAdapters } from './callback-adapters.mjs';

const db = new PGlite();
const root = new URL('../shared/database/', import.meta.url);
for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) {
  if (name === '003_seed_data.sql') continue;
  const sql = (await readFile(new URL(name,root),'utf8'))
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g,'')
    .replace(/uuid_generate_v4\(\)/g,'gen_random_uuid()');
  try { await db.exec(sql); }
  catch (e) { console.error('Migration failed:',name,e.message); throw e; }
}
const tenant = '10000000-0000-0000-0000-000000000001';
const otherTenant = '10000000-0000-0000-0000-000000000002';
const manager = '20000000-0000-0000-0000-000000000001';
const customerUser = '20000000-0000-0000-0000-000000000002';
const techUser = '20000000-0000-0000-0000-000000000003';
const outsider = '20000000-0000-0000-0000-000000000004';
const customer = '30000000-0000-0000-0000-000000000001';
const property = '40000000-0000-0000-0000-000000000001';
const sourceJob = '50000000-0000-0000-0000-000000000001';
const technician = '60000000-0000-0000-0000-000000000001';
await db.query(`INSERT INTO tenants(id,name) VALUES ($1,'Pilot'),($2,'Other')`,[tenant,otherTenant]);
for (const [id,role,email,t] of [[manager,'MANAGER','manager@example.test',tenant],[customerUser,'CUSTOMER','customer@example.test',tenant],[techUser,'TECHNICIAN','tech@example.test',tenant],[outsider,'MANAGER','other@example.test',otherTenant]]) {
  await db.query(`INSERT INTO users(id,tenant_id,email,password_hash,role) VALUES ($1,$2,$3,'unused',$4)`,[id,t,email,role]);
}
await db.query(`INSERT INTO customers(id,user_id,name) VALUES ($1,$2,'Customer')`,[customer,customerUser]);
await db.query(`INSERT INTO properties(id,customer_id,address) VALUES ($1,$2,'123 Main St')`,[property,customer]);
await db.query(`INSERT INTO technicians(id,user_id) VALUES ($1,$2)`,[technician,techUser]);
await db.query(`INSERT INTO jobs(id,tenant_id,customer_id,property_id,status,actual_departure) VALUES ($1,$2,$3,$4,'completed',now()-interval '5 days')`,[sourceJob,tenant,customer,property]);
await db.query(`INSERT INTO customer_emails(customer_id,email_address,is_primary) VALUES ($1,'customer@example.test',true)`,[customer]);
let checks = 0;
async function api(action,body={},actor=manager,t=tenant) {
  return (await db.query('SELECT callback_api($1,$2::uuid,$3::uuid,$4::jsonb) AS value',[action,t,actor,JSON.stringify(body)])).rows[0].value;
}
async function rejects(action,body,code,actor=manager,t=tenant) {
  await assert.rejects(api(action,body,actor,t),e=> e.code === code); checks++;
}
function equal(a,b) { assert.deepEqual(a,b); checks++; }
const intake = { property_id:property,source_job_id:sourceJob,pest_code:'ants',description:'Ants returned',request_key:crypto.randomUUID() };
await rejects('create',intake,'P0503',customerUser);
await rejects('settings',{enabled:true},'P0403',customerUser);
await api('settings',{enabled:true});
let c = await api('create',intake,customerUser);
equal(c.state,'submitted'); equal(c.coverage,'manual_review');
equal((await api('create',intake,customerUser)).id,c.id);
equal((await api('list',{},outsider,otherTenant)).items.length,0);
await rejects('get',{id:c.id},'P0404',outsider,otherTenant);
await rejects('get',{id:c.id},'P0404',techUser);
const orphan = '20000000-0000-0000-0000-000000000005';
await db.query("INSERT INTO users(id,tenant_id,email,password_hash,role) VALUES ($1,$2,'orphan@example.test','unused','CUSTOMER')",[orphan,tenant]);
await rejects('get',{id:c.id},'P0404',orphan);
await rejects('decision',{id:c.id,version:c.version,decision:'approve',billing_disposition:'no_charge',reason:'test',customer_message:'test'},'P0403',customerUser);
let assessed = await api('assess',{id:c.id,version:c.version});
equal(assessed.coverage,'manual_review');
await rejects('assess',{id:c.id,version:c.version},'P0409');
let policy = await api('create_policy',{name:'Residential',version:1,reporting_window_days:30,covered_pests:['ants'],exclusions:''});
await api('assign_policy',{kind:'job',target_id:sourceJob,policy_id:policy.id});
await assert.rejects(db.query(`UPDATE warranty_policy_versions SET name='Changed' WHERE id=$1`,[policy.id]),e=>e.code==='P0409'); checks++;
c = await api('assess',{id:c.id,version:assessed.version}); equal(c.coverage,'covered');
c = await api('decision',{id:c.id,version:c.version,decision:'approve',billing_disposition:'no_charge',reason:'Covered return',customer_message:'Your visit is covered.'});
const visitBody = {id:c.id,version:c.version,scheduled_start:new Date().toISOString(),technician_id:technician,request_key:crypto.randomUUID()};
c = await api('visit',visitBody); equal(c.visits.length,1);
equal((await api('visit',visitBody)).visits.length,1);
await rejects('visit',{...visitBody,version:c.version,request_key:crypto.randomUUID()},'P0409');
await assert.rejects(db.query('INSERT INTO invoices(job_id,total_amount) VALUES ($1,50)',[c.visits[0].job_id]),e=>e.code==='P0409'); checks++;
await assert.rejects(db.query("UPDATE jobs SET billing_disposition='standard' WHERE id=$1",[c.visits[0].job_id]),e=>e.code==='P0403'); checks++;
await rejects('resolve',{id:c.id,version:c.version,summary:'done',resolution_code:'treated',customer_message:'done'},'P0409');
await api('settings',{hourly_labor_rate:60,timezone:'America/Denver'});
c = await api('visit_update',{id:c.id,version:c.version,job_id:c.visits[0].job_id,operation:'start'},techUser); equal(c.state,'in_service');
const outcome = {id:c.id,version:c.version,job_id:c.visits[0].job_id,findings:'Ant trail found',summary:'Treated entry point',resolution_code:'treated',request_key:crypto.randomUUID()};
c = await api('outcome',outcome,techUser); equal(c.state,'awaiting_review');
equal((await api('outcome',outcome,techUser)).version,c.version);
c = await api('resolve',{id:c.id,version:c.version,summary:'Reviewed and resolved',resolution_code:'treated',customer_message:'Service complete.'}); equal(c.state,'resolved');
const customerCase = await api('get',{id:c.id},customerUser);
equal(customerCase.coverage_reason,undefined); equal(customerCase.policy_snapshot,undefined); equal(customerCase.visits[0].findings,undefined);
c = await api('reopen',{id:c.id,version:c.version,reason:'Activity recurred'}); equal(c.state,'triage');
await api('settings',{enabled:false}); equal((await api('get',{id:c.id},customerUser)).id,c.id);
await api('settings',{enabled:true});
// Excluded pest and missing source go to appropriate decisions.
let excluded = await api('create',{...intake,pest_code:'rodents',request_key:crypto.randomUUID()},customerUser);
excluded = await api('assess',{id:excluded.id,version:excluded.version}); equal(excluded.coverage,'not_covered');
let noSource = await api('create',{...intake,source_job_id:null,request_key:crypto.randomUUID()},customerUser);
noSource = await api('assess',{id:noSource.id,version:noSource.version}); equal(noSource.coverage,'manual_review');
await rejects('attachment',{id:noSource.id,data:'SGVsbG8=',name:'fake.jpg',media_type:'image/jpeg'},'P0400',customerUser);
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=';
noSource = await api('attachment',{id:noSource.id,data:png,name:'evidence.png',media_type:'image/png'},customerUser);
equal(noSource.attachments.length,1);
equal((await api('attachment_get',{id:noSource.id,attachment_id:noSource.attachments[0].id},customerUser)).media_type,'image/png');
await rejects('attachment_get',{id:noSource.id,attachment_id:noSource.attachments[0].id},'P0404',outsider,otherTenant);
// Paid approval blocks scheduling until explicit customer acceptance; acceptance creates no extra job.
excluded = await api('quote',{id:excluded.id,version:excluded.version,total_amount:75}); equal(excluded.quote.status,'sent');
const quote = excluded.quote.id;
excluded = await api('decision',{id:excluded.id,version:excluded.version,decision:'approve',billing_disposition:'quoted_paid',quote_id:quote,reason:'Not covered',customer_message:'Please accept the quote.'});
await rejects('visit',{...visitBody,id:excluded.id,version:excluded.version,request_key:crypto.randomUUID()},'P0409');
excluded = await api('accept_quote',{id:excluded.id,version:excluded.version},customerUser);
equal(excluded.quote.status,'accepted');
excluded = await api('visit',{...visitBody,id:excluded.id,version:excluded.version,request_key:crypto.randomUUID()}); equal(excluded.visits.length,1);
// Cancel and reschedule retain the case and warranty billing decision.
excluded = await api('visit_update',{id:excluded.id,version:excluded.version,job_id:excluded.visits[0].job_id,operation:'cancel',reason:'Customer unavailable'});
equal(excluded.state,'approved');
excluded = await api('visit',{...visitBody,id:excluded.id,version:excluded.version,request_key:crypto.randomUUID()}); equal(excluded.visits.length,2);
const report = await api('report'); equal(report.eligible_source_jobs,1); equal(report.source_jobs_with_callback,1);
await rejects('report',{},'P0403',customerUser);
// Missing completion time must not extend coverage using a later invoice/update time.
const unknownSource = (await db.query("INSERT INTO jobs(tenant_id,customer_id,property_id,status,warranty_policy_id) VALUES ($1,$2,$3,'completed',$4) RETURNING id",[tenant,customer,property,policy.id])).rows[0].id;
let unknown = await api('create',{...intake,source_job_id:unknownSource,request_key:crypto.randomUUID()},customerUser);
unknown = await api('assess',{id:unknown.id,version:unknown.version}); equal(unknown.coverage,'manual_review');
// Exact inclusive reporting-window boundary and one microsecond outside it.
let boundary = await api('create',{...intake,request_key:crypto.randomUUID()},customerUser);
await db.query("UPDATE jobs SET actual_departure=(SELECT reported_at FROM service_callbacks WHERE id=$1)-interval '30 days' WHERE id=$2",[boundary.id,sourceJob]);
boundary = await api('assess',{id:boundary.id,version:boundary.version}); equal(boundary.coverage,'covered');
await db.query("UPDATE jobs SET actual_departure=actual_departure-interval '1 microsecond' WHERE id=$1",[sourceJob]);
boundary = await api('assess',{id:boundary.id,version:boundary.version}); equal(boundary.coverage,'not_covered');
await db.query("UPDATE jobs SET actual_departure=now()-interval '5 days' WHERE id=$1",[sourceJob]);
// New recurring visits preserve the policy assigned when the job was created.
const recurring = (await db.query("INSERT INTO service_contracts(tenant_id,customer_id,property_id,cadence,start_date,warranty_policy_id) VALUES ($1,$2,$3,'MONTHLY',current_date-10,$4) RETURNING id",[tenant,customer,property,policy.id])).rows[0].id;
const recurringJob = (await db.query("INSERT INTO jobs(tenant_id,customer_id,property_id,contract_id,status,actual_departure) VALUES ($1,$2,$3,$4,'completed',now()-interval '1 day') RETURNING id,warranty_policy_id",[tenant,customer,property,recurring])).rows[0];
equal(recurringJob.warranty_policy_id,policy.id);
const nextPolicy = await api('create_policy',{name:'Residential',version:2,reporting_window_days:30,covered_pests:['rodents'],exclusions:''});
await api('assign_policy',{kind:'contract',target_id:recurring,policy_id:nextPolicy.id});
let recurringCase = await api('create',{...intake,source_job_id:recurringJob.id,request_key:crypto.randomUUID()},customerUser);
recurringCase = await api('assess',{id:recurringCase.id,version:recurringCase.version}); equal(recurringCase.coverage,'covered');
await db.query("UPDATE service_contracts SET status='inactive' WHERE id=$1",[recurring]);
recurringCase = await api('assess',{id:recurringCase.id,version:recurringCase.version}); equal(recurringCase.coverage,'not_covered');
console.log(`Callbacks: ${checks} integration assertions passed`);
await testAdapters(db,{tenant,customerUser,property,caseId:c.id});
await db.close();
