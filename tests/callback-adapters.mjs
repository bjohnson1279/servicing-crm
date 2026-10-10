import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function testAdapters(db, fixture) {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const load = Module._load;
  const ts = require('../backends/express-api/node_modules/typescript');
  const { readFileSync } = require('node:fs');
  const oldTs = require.extensions['.ts'];
  require.extensions['.ts'] = (module,filename) => module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  Module._load = function(name,...rest) {
    if (name === '@prisma/client') return {PrismaClient:class {
      async $queryRaw(strings,...values) {
        const sql = strings.reduce((text,part,index)=>text+part+(index<values.length ? '$'+(index+1) : ''),'');
        try { return (await db.query(sql,values)).rows; }
        catch(e) { throw {meta:{code:e.code,message:e.message}}; }
      }
    }};
    return load.call(this,name,...rest);
  };
  const secret = 'callback-test-signing-key'; process.env.JWT_SECRET=secret;
  const jwt = (claims,alg='HS256') => {
    const header=Buffer.from(JSON.stringify({alg,typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
    return header+'.'+payload+'.'+createHmac('sha256',secret).update(header+'.'+payload).digest('base64url');
  };
  const claims={id:fixture.customerUser,tenantId:fixture.tenant,exp:Date.now()/1000+3600};
  const token=jwt(claims); let checks=0;
  function equal(a,b) {assert.deepEqual(a,b);checks++;}
  const service=require('../backends/express-api/src/domains/crm/callbackService.ts');
  equal(service.callbackActor('Bearer '+token),{id:claims.id,tenantId:claims.tenantId});
  for (const invalid of [undefined,'Bearer garbage','Bearer '+jwt({...claims,exp:1}),'Bearer '+jwt(claims,'none'),'Bearer '+jwt({...claims,nbf:Date.now()/1000+7200}),'Bearer '+jwt({...claims,exp:'later'})]) {
    assert.throws(()=>service.callbackActor(invalid),e=>e.status===401);checks++;
  }
  const fastify=require('../backends/express-api/node_modules/fastify')();
  await fastify.register(require('../backends/express-api/src/domains/crm/callbackRoutes.ts').default,{prefix:'/api/v1/callbacks'});
  const request=async(method,url,body,auth=token)=>fastify.inject({method,url,payload:body,headers:auth ? {authorization:'Bearer '+auth} : {}});
  equal((await request('GET','/api/v1/callbacks/',undefined,null)).statusCode,401);
  equal((await request('GET','/api/v1/callbacks/report')).statusCode,403);
  equal((await request('GET',`/api/v1/callbacks/${fixture.caseId}`)).json().id,fixture.caseId);
  const create = await request('POST','/api/v1/callbacks/',{property_id:fixture.property,pest_code:'ants',description:'HTTP intake',request_key:crypto.randomUUID()});
  equal(create.statusCode,200);equal(create.json().state,'submitted');
  equal((await request('POST',`/api/v1/callbacks/${fixture.caseId}/decision`,{version:1,decision:'approve'})).statusCode,409);
  const graphRequire=createRequire(fileURLToPath(new URL('../backends/graphql-api/package.json',import.meta.url)));
  const express=graphRequire('express'); const server=express(); server.use(express.json());
  server.use('/api/v1/callbacks',require('../backends/graphql-api/src/domains/crm/callbackRoutes.ts').default);
  const http=server.listen(0,'127.0.0.1'); await new Promise(resolve=>http.once('listening',resolve));
  try {
    const url=`http://127.0.0.1:${http.address().port}/api/v1/callbacks/`;
    equal((await fetch(url)).status,401);
    const response=await fetch(url+fixture.caseId,{headers:{Authorization:'Bearer '+token}});
    equal(response.status,200);equal((await response.json()).id,fixture.caseId);
    const stream = await fetch(url+'events',{headers:{Authorization:'Bearer '+token}});
    equal(stream.headers.get('content-type'),'text/event-stream');
    const reader=stream.body.getReader(); const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/event: callbacks/);checks++;
    await reader.cancel();
  } finally {http.closeAllConnections(); await new Promise(resolve=>http.close(resolve));}
  const {buildSchema,graphql}=graphRequire('graphql');
  const schema=buildSchema(readFileSync(new URL('../shared/contracts/callbacks.graphql',import.meta.url),'utf8')+'\nscalar UUID\nscalar DateTime\ntype Query { placeholder: Boolean }\ntype Mutation { placeholder: Boolean }');
  const resolvers=require('../backends/graphql-api/src/domains/crm/callbackResolvers.ts').callbackResolvers;
  const result=await graphql({schema,source:'query($id:UUID!){callback(id:$id){id state coverage_reason}}',variableValues:{id:fixture.caseId},contextValue:{authorization:'Bearer '+token},rootValue:{callback:(args,ctx)=>resolvers.Query.callback(null,args,ctx)}});
  equal(result.errors,undefined);equal(result.data.callback.id,fixture.caseId);equal(result.data.callback.coverage_reason,null);
  const denied=await graphql({schema,source:'{callbacks{items{id}}}',contextValue:{},rootValue:{callbacks:(args,ctx)=>resolvers.Query.callbacks(null,args,ctx)}});
  equal(denied.errors[0].extensions.status,401);
  await fastify.close(); Module._load=load; require.extensions['.ts']=oldTs;
  console.log(`Callback adapters: ${checks} authentication, REST, GraphQL and SSE assertions passed`);
}
