import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../.callback-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import { testPlaybookAdapters } from './playbook-adapters.mjs';

const db = new PGlite();
const root = new URL('../shared/database/', import.meta.url);
for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) {
  if (name !== '003_seed_data.sql') {
    await db.exec(
      (await readFile(new URL(name, root), 'utf8'))
        .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
        .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()')
    );
  }
}

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tenant = id(1),
  other = id(2),
  manager = id(3),
  techUser = id(4),
  techUser2 = id(5),
  customerUser = id(6),
  customer = id(7),
  property = id(8),
  tech = id(9),
  tech2 = id(10),
  job = id(11),
  outside = id(12);

await db.query("INSERT INTO tenants(id,name) VALUES($1,'One'),($2,'Two')", [tenant, other]);
for (const [user, role, t] of [
  [manager, 'MANAGER', tenant],
  [techUser, 'TECHNICIAN', tenant],
  [techUser2, 'TECHNICIAN', tenant],
  [customerUser, 'CUSTOMER', tenant],
  [outside, 'MANAGER', other],
]) {
  await db.query("INSERT INTO users(id,tenant_id,email,password_hash,role) VALUES($1,$2,$3,'x',$4)", [
    user,
    t,
    user + '@test',
    role,
  ]);
}
await db.query("INSERT INTO customers(id,user_id,name) VALUES($1,$2,'Client')", [customer, customerUser]);
await db.query("INSERT INTO properties(id,customer_id,address) VALUES($1,$2,'100 Oak Ave')", [property, customer]);
await db.query('INSERT INTO technicians(id,user_id) VALUES($1,$2),($3,$4)', [tech, techUser, tech2, techUser2]);
await db.query(
  "INSERT INTO jobs(id,tenant_id,customer_id,property_id,technician_id,status) VALUES($1,$2,$3,$4,$5,'scheduled')",
  [job, tenant, customer, property, tech]
);

let checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
async function api(action, body = {}, actor = manager, t = tenant) {
  return (
    await db.query('SELECT playbook_api($1,$2::uuid,$3::uuid,$4::jsonb) AS value', [
      action,
      t,
      actor,
      JSON.stringify(body),
    ])
  ).rows[0].value;
}
async function denied(action, body, code, actor = manager, t = tenant) {
  await assert.rejects(api(action, body, actor, t), e => e.code === code);
  checks++;
}

// 1. Disabled by default & RBAC on settings
await denied('list', {}, 'P0503');
await denied('settings', { enabled: true }, 'P0403', techUser);
await denied('settings', {}, 'P0403', customerUser);
await denied('settings', {}, 'P0401', outside, tenant);
eq((await api('settings', { enabled: true })).enabled, true);
eq((await api('settings', {}, techUser)).enabled, true);

// 2. Options & Property Service Brief creation with optimistic locking
await denied('options', {}, 'P0403', techUser);
const opts = await api('options');
eq(opts.properties.length, 1);

await denied('save_brief', { property_id: property, access_instructions: 'Side gate' }, 'P0403', techUser);
await denied('save_brief', { property_id: property, access_instructions: '   ' }, 'P0400');

const brief1 = await api('save_brief', {
  property_id: property,
  access_instructions: 'Use side gate; lock after entry',
  restricted_credentials: 'Keypad #4821',
  known_hazards: 'Steep basement stairs',
  pets_notes: 'Friendly golden retriever',
  pest_concerns: 'Carpenter ants near deck',
  service_zones: ['Exterior perimeter', 'Basement'],
});
eq(brief1.version, 1);
eq(brief1.access_instructions, 'Use side gate; lock after entry');

// Optimistic lock conflict on stale version
await denied(
  'save_brief',
  { property_id: property, access_instructions: 'Stale write', version: 99 },
  'P0409'
);
const brief2 = await api('save_brief', {
  property_id: property,
  access_instructions: 'Use side gate; ring doorbell first',
  version: 1,
});
eq(brief2.version, 2);

// 3. Publish immutable checklist template
await denied(
  'publish_template',
  { template_key: 'ext-quarterly', title: 'Quarterly Exterior', tasks: [{ id: 't1', label: 'Inspect eaves', required: true }] },
  'P0403',
  techUser
);
await denied('publish_template', { template_key: 'ext-quarterly', title: 'Empty', tasks: [] }, 'P0400');

const tpl1 = await api('publish_template', {
  template_key: 'ext-quarterly',
  title: 'Quarterly Exterior & Perimeter',
  service_type: 'quarterly_pest',
  tasks: [
    { id: 'inspect_eaves', label: 'Sweep and treat eaves', required: true, response_type: 'check' },
    { id: 'granule_barrier', label: 'Apply exterior granule barrier', required: true, response_type: 'text' },
    { id: 'garage_webbing', label: 'Clear garage cobwebs', required: false, response_type: 'check' },
  ],
});
eq(tpl1.version, 1);

// Publishing again increments version
const tpl2 = await api('publish_template', {
  template_key: 'ext-quarterly',
  title: 'Quarterly Exterior & Perimeter v2',
  service_type: 'quarterly_pest',
  tasks: tpl1.tasks,
});
eq(tpl2.version, 2);

// 4. Start playbook run & enforce technician job assignment isolation
await denied(
  'start_run',
  { job_id: job, checklist_version_id: tpl2.id },
  'P0404',
  techUser2
);

const run1 = await api('start_run', { job_id: job, checklist_version_id: tpl2.id }, techUser);
eq(run1.state, 'pending_ack');
eq(run1.brief_snapshot.access_instructions, 'Use side gate; ring doorbell first');
eq(run1.checklist_snapshot.length, 3);

// Unassigned technician cannot view or list another technician's run
eq((await api('list', {}, techUser2)).items.length, 0);
await denied('get', { id: run1.id }, 'P0404', techUser2);

// 5. Cannot save responses or submit before acknowledging property brief
await denied(
  'save_run',
  { id: run1.id, responses: { inspect_eaves: 'done' } },
  'P0409',
  techUser
);
await denied('submit', { id: run1.id }, 'P0409', techUser);

// 6. Acknowledge property brief -> transitions to in_progress
const acked = await api('acknowledge', { id: run1.id, version: run1.version }, techUser);
eq(acked.state, 'in_progress');
assert.ok(acked.acknowledged_at);
checks++;

// 7. Required tasks must have a response or exception reason before submission
const saved = await api(
  'save_run',
  {
    id: run1.id,
    version: acked.version,
    responses: { inspect_eaves: 'Completed eave sweep' },
    observations: 'Found new wasp nest on north gable',
    follow_up_flagged: true,
  },
  techUser
);
eq(saved.version, 3);
await denied('submit', { id: run1.id, version: saved.version }, 'P0400', techUser);

// Supply exception reason for second required task and submit
const submitted = await api(
  'submit',
  {
    id: run1.id,
    version: saved.version,
    exceptions: { granule_barrier: 'Heavy rain — rescheduled barrier application' },
  },
  techUser
);
eq(submitted.state, 'submitted');
assert.ok(submitted.submitted_at);
checks++;

// Locked after submission
await denied('save_run', { id: run1.id, observations: 'Late edit' }, 'P0409', techUser);
await denied('review', { id: run1.id, review_notes: 'Self review' }, 'P0403', techUser);

// 8. Office staff reviews submitted run and promotes observation to property brief
const reviewed = await api('review', {
  id: run1.id,
  version: submitted.version,
  review_notes: 'Approved exception; scheduled dry-weather follow-up',
  promote_to_brief: true,
});
eq(reviewed.state, 'reviewed');
eq(reviewed.events.length, 5);

const updatedBrief = (await db.query('SELECT pest_concerns, version FROM property_service_briefs WHERE property_id=$1', [property])).rows[0];
assert.ok(updatedBrief.pest_concerns.includes('Found new wasp nest on north gable'));
eq(updatedBrief.version, 3);
checks++;

// 9. Playbook event audit log is immutable
await assert.rejects(db.query("DELETE FROM playbook_events"), e => e.code === 'P0409');
checks++;

// 10. Slice 2: Property Template Assignments, Template Retirement, and Job Completion Gate
await denied('assign_template', { property_id: property, checklist_version_id: tpl2.id }, 'P0403', techUser);
const assigned = await api('assign_template', {
  property_id: property,
  checklist_version_id: tpl2.id,
  service_type: 'quarterly_pest',
});
eq(assigned.property_id, property);
eq(assigned.checklist_version_id, tpl2.id);

await denied('retire_template', { checklist_version_id: tpl1.id }, 'P0403', techUser);
const retiredTpl = await api('retire_template', { checklist_version_id: tpl1.id });
eq(retiredTpl.status, 'retired');

await denied('completion_check', { job_id: job }, 'P0404', techUser2);
const compCheck = await api('completion_check', { job_id: job }, techUser);
eq(compCheck.has_playbook, true);
eq(compCheck.can_complete, true);
eq(compCheck.state, 'reviewed');

console.log(`PASS: ${checks} property service playbook SQL lifecycle, RBAC, and audit checks`);
await testPlaybookAdapters(db, {
  tenant,
  manager,
  techUser,
  techUser2,
  customerUser,
  property,
  job,
  run: run1.id,
});
await db.close();
