import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
export async function testJobAdapters(db,f) {
 const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load,ts=require('../backends/express-api/node_modules/typescript'),{readFileSync}=require('node:fs'),oldTs=require.extensions['.ts'];
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
 Module._load=function(name,...rest) {
  if(name==='@prisma/client')return {PrismaClient:class{async $queryRaw(strings,...values){try{return (await db.query(strings.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),''),values)).rows;}catch(e){throw {meta:{code:e.code,message:e.message}};}}}};
  return load.call(this,name,...rest);
 };
 const previous=process.env.JWT_SECRET,secret='job-test-secret';process.env.JWT_SECRET=secret;
 const token=(id,tenantId=f.tenant)=>{const head=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),body=Buffer.from(JSON.stringify({id,tenantId,role:'SUPER_ADMIN',exp:Date.now()/1000+300})).toString('base64url');return 'Bearer '+head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
 const app=require('../backends/express-api/node_modules/fastify')();let checks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 try {
  await app.register(require('../backends/express-api/src/domains/dispatch/jobRoutes.ts').default,{prefix:'/jobs'});
  await app.register(require('../backends/express-api/src/domains/dispatch/technicianRoutes.ts').default,{prefix:'/technicians'});
  await app.register(require('../backends/express-api/src/domains/dispatch/dispatchRoutes.ts').default,{prefix:'/dispatch'});
  eq((await app.inject({url:'/jobs/'})).statusCode,401);
  eq((await app.inject({url:'/jobs/',headers:{authorization:'Bearer bad'}})).statusCode,401);
  eq((await app.inject({url:'/jobs/',headers:{authorization:token(f.techUser)}})).json().length,0);
  eq((await app.inject({url:'/jobs/',headers:{authorization:token(f.manager,f.other)}})).statusCode,401);
  eq((await app.inject({method:'POST',url:'/jobs/',headers:{authorization:token(f.techUser)},payload:{customerId:f.customer,propertyId:f.property}})).statusCode,403);
  eq((await app.inject({method:'PATCH',url:'/jobs/'+f.job,headers:{authorization:token(f.techUser)},payload:{status:'completed'}})).statusCode,404);
  eq((await app.inject({method:'POST',url:'/dispatch/commit-schedule',headers:{authorization:token(f.techUser)},payload:{schedule:[]}})).statusCode,403);
  eq((await app.inject({url:'/jobs/calendar',headers:{authorization:token(f.manager)}})).statusCode,200);
  eq((await app.inject({url:'/technicians/',headers:{authorization:token(f.techUser)}})).json().length,1);
  const created=await app.inject({method:'POST',url:'/jobs/',headers:{authorization:token(f.manager)},payload:{customerId:f.customer,propertyId:f.property}});
  eq(created.statusCode,201);eq(created.json().tenantId,f.tenant);
  const gql=require('../backends/graphql-api/src/domains/dispatch/jobResolvers.ts').jobResolvers;
  for(const [ctx,status] of [[{},401],[{authorization:token(f.manager,f.other)},401]]){await assert.rejects(gql.Query.jobs(null,{},ctx),e=>e.extensions.status===status);checks++;}
  eq((await gql.Query.jobs(null,{}, {authorization:token(f.techUser)})).length,0);
  await assert.rejects(gql.Mutation.createJob(null,{customerId:f.customer,propertyId:f.property},{authorization:token(f.techUser)}),e=>e.extensions.status===403);checks++;
  const dispatch=require('../backends/graphql-api/src/domains/dispatch/resolvers.ts').dispatchResolvers;
  await assert.rejects(dispatch.Mutation.emergencyDispatch(null,{}, {authorization:token(f.techUser)}),e=>e.extensions.status===403);checks++;
  console.log(checks+' job adapter checks passed');
 } finally {await app.close();Module._load=load;require.extensions['.ts']=oldTs;if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
}
