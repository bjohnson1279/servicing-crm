import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

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

console.log(`Verified ${applied} SQL migrations and ${requiredFunctions.length} canonical PL/pgSQL API functions.`);
