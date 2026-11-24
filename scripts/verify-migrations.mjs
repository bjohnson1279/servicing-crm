import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const pglitePath = process.env.PGLITE_MODULE || '../.callback-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(new URL(pglitePath, import.meta.url));

const db = new PGlite();
const root = new URL('../shared/database/', import.meta.url);
const files = (await readdir(root)).filter(n => n.endsWith('.sql')).sort();
assert.ok(files.length >= 45, `Expected at least 45 SQL migrations, found ${files.length}`);

let applied = 0;
for (const name of files) {
  if (name === '003_seed_data.sql') continue;
  const sql = (await readFile(new URL(name, root), 'utf8'))
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
  await db.exec(sql);
  applied++;
}

const requiredFunctions = [
  'callback_api',
  'recurring_api',
  'profitability_api',
  'commercial_api',
  'inspection_api',
  'device_api',
  'catalog_api',
  'playbook_api',
];

const { rows } = await db.query(
  `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])`,
  [requiredFunctions]
);
const present = new Set(rows.map(r => r.proname));
for (const fn of requiredFunctions) {
  assert.ok(present.has(fn), `Missing canonical PL/pgSQL function after migration replay: ${fn}`);
}

// Live PL/pgSQL smoke test across all 8 canonical domain APIs (Slice 1 + Slice 2)
const { rows: [tenant] } = await db.query(
  `INSERT INTO tenants (name) VALUES ('CI Verification Tenant') RETURNING id`
);
const { rows: [manager] } = await db.query(
  `INSERT INTO users (tenant_id, email, password_hash, role)
   VALUES ($1, 'ci-manager@example.test', 'hash', 'MANAGER') RETURNING id`,
  [tenant.id]
);

const callApi = async (fn, action, body = {}) => {
  const res = await db.query(`SELECT ${fn}($1, $2::uuid, $3::uuid, $4::jsonb) AS out`, [
    action,
    tenant.id,
    manager.id,
    JSON.stringify(body),
  ]);
  return res.rows[0].out;
};

// Verify settings reads across all 8 canonical APIs
for (const [fn, readAction] of [
  ['callback_api', 'settings'],
  ['recurring_api', 'settings_read'],
  ['profitability_api', 'settings_read'],
  ['commercial_api', 'settings_read'],
  ['inspection_api', 'settings'],
  ['device_api', 'settings'],
  ['catalog_api', 'settings'],
  ['playbook_api', 'settings'],
]) {
  const s = await callApi(fn, readAction);
  assert.equal(typeof s, 'object', `${fn}('${readAction}') should return an object`);
}

// Enable Catalog & verify Slice 2 compliance_summary
await callApi('catalog_api', 'settings', { enabled: true });
const catalogSummary = await callApi('catalog_api', 'compliance_summary');
assert.equal(catalogSummary.total_products, 0);
assert.equal(catalogSummary.active_verified_count, 0);

// Enable Playbooks & verify Slice 1+2 template publish & retire
await callApi('playbook_api', 'settings', { enabled: true });
const tpl = await callApi('playbook_api', 'publish_template', {
  template_key: 'ci-smoke',
  title: 'CI Smoke Checklist',
  tasks: [{ id: 't1', label: 'Verify perimeter', required: true }],
});
assert.equal(tpl.version, 1);
const retired = await callApi('playbook_api', 'retire_template', { checklist_version_id: tpl.id });
assert.equal(retired.status, 'retired');

// Enable Commercial & verify account creation + Slice 2 consolidated summary
await callApi('commercial_api', 'settings', { enabled: true });
const acct = await callApi('commercial_api', 'create', {
  code: 'CI-ACME',
  name: 'CI Acme Corp',
  reason: 'CI smoke verification',
  request_key: crypto.randomUUID(),
});
const acctSummary = await callApi('commercial_api', 'summary', { id: acct.id });
assert.equal(acctSummary.active_site_count, 0);
assert.equal(acctSummary.total_jobs, 0);

// Enable Profitability & verify Slice 2 rollup
await callApi('profitability_api', 'settings', { enabled: false, currency: 'USD', timezone: 'America/Denver' });
await callApi('profitability_api', 'policy', {
  effective_from: '2025-01-01',
  hourly_rate: '45.00',
  reason: 'CI smoke baseline',
  request_key: crypto.randomUUID(),
});
await callApi('profitability_api', 'settings', { enabled: true, currency: 'USD', timezone: 'America/Denver' });
const rollup = await callApi('profitability_api', 'rollup');
assert.equal(rollup.currency, 'USD');
assert.equal(rollup.total_jobs, 0);

console.log(`Verified ${applied} SQL migrations, ${requiredFunctions.length} canonical PL/pgSQL APIs, and live Slice 1+2 smoke checks.`);
