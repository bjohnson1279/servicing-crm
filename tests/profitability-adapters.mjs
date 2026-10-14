import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
export async function testProfitabilityAdapters(db,f){
 const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load,ts=require('../backends/express-api/node_modules/typescript'),{readFileSync}=require('node:fs'),oldTs=require.extensions['.ts'];
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
 Module._load=function(name,...rest){if(name==='@prisma/client')return{PrismaClient:class{async $queryRaw(strings,...values){try{return(await db.query(strings.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),''),values)).rows;}catch(e){throw{meta:{code:e.code,message:e.message}};}}}};return load.call(this,name,...rest);};
 const previous=process.env.JWT_SECRET,secret='device-test-secret';process.env.JWT_SECRET=secret;
 const token=id=>{const head=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),body=Buffer.from(JSON.stringify({id,tenantId:f.tenant,role:'SUPER_ADMIN',exp:Date.now()/1000+60})).toString('base64url');return 'Bearer '+head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
 const app=require('../backends/express-api/node_modules/fastify')();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 try{
  await app.register(require('../backends/express-api/src/domains/crm/profitabilityRoutes.ts').default,{prefix:'/profitability'});
  eq((await app.inject({url:'/profitability/'})).statusCode,401);
  eq((await app.inject({url:'/profitability/',headers:{authorization:token(f.customerUser)}})).statusCode,403);
  eq((await app.inject({url:'/profitability/'+f.job,headers:{authorization:token(f.techUser)}})).statusCode,403);
  const selected=await app.inject({url:'/profitability/'+f.job,headers:{authorization:token(f.manager)}});
  eq(selected.statusCode,200);eq(selected.headers['cache-control'],'no-store');
  eq((await app.inject({method:'POST',url:'/profitability/'+f.job+'/costs',headers:{authorization:token(f.techUser)},payload:{role:'MANAGER',request_key:crypto.randomUUID()}})).statusCode,403);
  eq((await app.inject({method:'POST',url:'/profitability/settings',headers:{authorization:token(f.techUser)},payload:{enabled:true}})).statusCode,403);
  const gql=require('../backends/graphql-api/src/domains/crm/profitabilityResolvers.ts').profitabilityResolvers;
  await assert.rejects(gql.Query.jobCost(null,{id:f.job},{authorization:token(f.techUser)}),e=>e.extensions.status===403);checks++;
  eq((await gql.Query.jobCost(null,{id:f.job},{authorization:token(f.manager)})).id,f.job);
  await assert.rejects(async()=>gql.Mutation.profitabilityCommand(null,{action:'skip',input:{}},{authorization:token(f.manager)}));checks++;
  const {buildSchema,graphql}=require('../backends/graphql-api/node_modules/graphql');const schema=buildSchema(require('../backends/graphql-api/src/typeDefs.ts').typeDefs);
  const result=await graphql({schema,source:'{ profitabilitySettings }',rootValue:{profitabilitySettings:()=>gql.Query.profitabilitySettings(null,{}, {authorization:token(f.manager)})}});
  eq(result.errors,undefined);eq(result.data.profitabilitySettings.enabled,true);
  console.log(checks+' profitability transport checks passed');
 }finally{await app.close();Module._load=load;require.extensions['.ts']=oldTs;if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
}
