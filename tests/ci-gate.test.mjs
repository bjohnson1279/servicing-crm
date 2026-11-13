import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const gateJob = workflow.split('  ci-required:')[1];
const required = gateJob.match(/needs: \[([^\]]+)\]/)[1].split(',').map(name => name.trim());
const script = fileURLToPath(new URL('../scripts/ci-gate.mjs', import.meta.url));
const success = () => Object.fromEntries(required.map(name => [name, { result: 'success' }]));
function run(results) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, CI_RESULTS: typeof results === 'string' ? results : JSON.stringify(results) },
  });
}

test('the merge gate runs even when a dependency fails or is skipped', () => {
  assert.match(gateJob, /if: \$\{\{ always\(\) \}\}/);
  assert.match(gateJob, /CI_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(gateJob, /run: node scripts\/ci-gate\.mjs/);
  const jobs = [...workflow.split('\njobs:\n')[1].matchAll(/^  ([a-z][\w-]*):\s*$/gm)].map(match => match[1]);
  assert.deepEqual([...required].sort(), jobs.filter(name => name !== 'ci-required').sort());
});

test('all successful jobs allow the gate to pass', () => {
  const result = run(success());
  assert.equal(result.status, 0, result.stderr);
});

for (const name of required) {
  for (const state of ['failure', 'cancelled', 'skipped', 'pending', 'missing']) {
    test(`${name} ${state} blocks the gate`, () => {
      const results = success();
      if (state === 'missing') delete results[name];
      else results[name].result = state;
      const result = run(results);
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(name));
    });
  }
}

for (const invalid of ['', '{}', 'null', 'not-json']) {
  test(`invalid or empty results ${JSON.stringify(invalid)} block the gate`, () => {
    assert.equal(run(invalid).status, 1);
  });
}
