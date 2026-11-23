import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

export async function testPlaybookAdapters(db, f) {
  const require = createRequire(import.meta.url),
    Module = require('node:module'),
    load = Module._load,
    ts = require('../backends/express-api/node_modules/typescript'),
    { readFileSync } = require('node:fs'),
    oldTs = require.extensions['.ts'];
  require.extensions['.ts'] = (m, p) =>
    m._compile(
      ts.transpileModule(readFileSync(p, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      p
    );
  Module._load = function (name, ...rest) {
    if (name === '@prisma/client')
      return {
        PrismaClient: class {
          async $queryRaw(strings, ...values) {
            try {
              return (
                await db.query(
                  strings.reduce((s, p, i) => s + p + (i < values.length ? '$' + (i + 1) : ''), ''),
                  values
                )
              ).rows;
            } catch (e) {
              throw { meta: { code: e.code, message: e.message } };
            }
          }
        },
      };
    return load.call(this, name, ...rest);
  };
  const previous = process.env.JWT_SECRET,
    secret = 'playbook-test-secret';
  process.env.JWT_SECRET = secret;
  const token = id => {
    const head = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
      body = Buffer.from(
        JSON.stringify({ id, tenantId: f.tenant, role: 'SUPER_ADMIN', exp: Date.now() / 1000 + 60 })
      ).toString('base64url');
    return 'Bearer ' + head + '.' + body + '.' + createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
  };
  const app = require('../backends/express-api/node_modules/fastify')();
  let checks = 0;
  const eq = (a, b) => {
    assert.deepEqual(a, b);
    checks++;
  };
  try {
    await app.register(require('../backends/express-api/src/domains/crm/playbookRoutes.ts').default, {
      prefix: '/playbooks',
    });
    eq((await app.inject({ url: '/playbooks/' })).statusCode, 401);
    eq((await app.inject({ url: '/playbooks/', headers: { authorization: token(f.customerUser) } })).statusCode, 403);
    eq((await app.inject({ url: '/playbooks/' + f.run, headers: { authorization: token(f.techUser2) } })).statusCode, 404);
    const selected = await app.inject({ url: '/playbooks/' + f.run, headers: { authorization: token(f.techUser) } });
    eq(selected.statusCode, 200);
    eq(selected.json().state, 'reviewed');
    eq(selected.headers['cache-control'], 'no-store');
    const comp = await app.inject({
      url: '/playbooks/completion-check?job_id=' + f.job,
      headers: { authorization: token(f.techUser) },
    });
    eq(comp.statusCode, 200);
    eq(comp.json().can_complete, true);
    eq(
      (
        await app.inject({
          method: 'POST',
          url: '/playbooks/briefs',
          headers: { authorization: token(f.techUser) },
          payload: { property_id: f.property, access_instructions: 'Forged' },
        })
      ).statusCode,
      403
    );
    const gql = require('../backends/graphql-api/src/domains/crm/playbookResolvers.ts').playbookResolvers;
    await assert.rejects(
      gql.Query.playbookRun(null, { id: f.run }, { authorization: token(f.techUser2) }),
      e => e.extensions.status === 404
    );
    checks++;
    eq((await gql.Query.playbookRun(null, { id: f.run }, { authorization: token(f.techUser) })).id, f.run);
    await assert.rejects(
      gql.Mutation.playbookCommand(
        null,
        { action: 'save_brief', input: { property_id: f.property, access_instructions: 'Forged' } },
        { authorization: token(f.techUser) }
      ),
      e => e.extensions.status === 403
    );
    checks++;
    const { buildSchema, graphql } = require('../backends/graphql-api/node_modules/graphql');
    const schema = buildSchema(require('../backends/graphql-api/src/typeDefs.ts').typeDefs);
    const result = await graphql({
      schema,
      source: '{ playbookSettings }',
      rootValue: {
        playbookSettings: () => gql.Query.playbookSettings(null, {}, { authorization: token(f.manager) }),
      },
    });
    eq(result.errors, undefined);
    eq(result.data.playbookSettings.enabled, true);
    console.log(checks + ' playbook transport checks passed');
  } finally {
    await app.close();
    Module._load = load;
    require.extensions['.ts'] = oldTs;
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}
