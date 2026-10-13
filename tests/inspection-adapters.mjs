import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
export async function testInspectionAdapters(db,f) {
 const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load,ts=require('../backends/express-api/node_modules/typescript'),{readFileSync}=require('node:fs'),oldTs=require.extensions['.ts'];
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
 Module._load=function(name,...rest){if(name==='@prisma/client')return {PrismaClient:class{async $queryRaw(strings,...values){try{return(await db.query(strings.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),''),values)).rows;}catch(e){throw{meta:{code:e.code,message:e.message}};}}}};return load.call(this,name,...rest);};
 const previous=process.env.JWT_SECRET,secret='inspection-test-secret';process.env.JWT_SECRET=secret;
 const token=id=>{const head=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),body=Buffer.from(JSON.stringify({id,tenantId:f.tenant,role:'SUPER_ADMIN',exp:Date.now()/1000+60})).toString('base64url');return 'Bearer '+head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
 const app=require('../backends/express-api/node_modules/fastify')();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 try {
  await app.register(require('../backends/express-api/src/domains/crm/inspectionRoutes.ts').default,{prefix:'/inspections'});
  eq((await app.inject({url:'/inspections/'})).statusCode,401);
  eq((await app.inject({url:'/inspections/',headers:{authorization:'Bearer bad'}})).statusCode,401);
  eq((await app.inject({url:'/inspections/',headers:{authorization:token(f.customerUser)}})).statusCode,403);
  eq((await app.inject({url:'/inspections/',headers:{authorization:token(f.techUser)}})).json().items.length,0);
  eq((await app.inject({url:'/inspections/'+f.inspection,headers:{authorization:token(f.techUser)}})).statusCode,404);
  eq((await app.inject({url:'/inspections/'+f.inspection,headers:{authorization:token(f.manager)}})).json().state,'reviewed');
  eq((await app.inject({method:'POST',url:'/inspections/settings',headers:{authorization:token(f.techUser)},payload:{enabled:true}})).statusCode,403);
  eq((await app.inject({method:'POST',url:'/inspections/',headers:{authorization:token(f.techUser)},payload:{job_id:f.job,request_key:crypto.randomUUID(),role:'MANAGER'}})).statusCode,403);
  eq((await app.inject({url:'/inspections/'+f.inspection+'/attachments/'+f.photo,headers:{authorization:token(f.manager)}})).json().media_type,'image/png');
  eq((await app.inject({url:'/inspections/'+f.inspection+'/attachments/'+f.photo,headers:{authorization:token(f.manager)}})).headers['cache-control'],'no-store');
  const gql=require('../backends/graphql-api/src/domains/crm/inspectionResolvers.ts').inspectionResolvers;
  eq((await gql.Query.inspections(null,{}, {authorization:token(f.techUser)})).items.length,0);
  await assert.rejects(gql.Query.inspection(null,{id:f.inspection},{authorization:token(f.techUser)}),e=>e.extensions.status===404);checks++;
  await assert.rejects(gql.Mutation.inspectionCommand(null,{action:'review',input:{id:f.inspection,request_key:crypto.randomUUID(),version:f.version,decision:'reviewed',reason:'Forged approval'}},{authorization:token(f.techUser)}),e=>e.extensions.status===404);checks++;
  await assert.rejects(gql.Query.inspections(null,{},{}),e=>e.extensions.status===401);checks++;
  const {buildSchema,graphql}=require('../backends/graphql-api/node_modules/graphql');
  const schema=buildSchema(require('../backends/graphql-api/src/typeDefs.ts').typeDefs);
  const result=await graphql({schema,source:'{ inspectionSettings }',rootValue:{inspectionSettings:()=>gql.Query.inspectionSettings(null,{}, {authorization:token(f.manager)})}});
  eq(result.errors,undefined);eq(result.data.inspectionSettings.enabled,true);
  console.log(checks+' inspection transport checks passed');
 } finally {await app.close();Module._load=load;require.extensions['.ts']=oldTs;if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
}
