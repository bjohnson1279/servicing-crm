import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
export async function testCatalogAdapters(db,f){
 const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load,ts=require('../backends/express-api/node_modules/typescript'),{readFileSync}=require('node:fs'),oldTs=require.extensions['.ts'];
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
 Module._load=function(name,...rest){if(name==='@prisma/client')return{PrismaClient:class{async $queryRaw(strings,...values){try{return(await db.query(strings.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),''),values)).rows;}catch(e){throw{meta:{code:e.code,message:e.message}};}}}};return load.call(this,name,...rest);};
 const previous=process.env.JWT_SECRET,secret='catalog-test-secret';process.env.JWT_SECRET=secret;
 const token=id=>{const head=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),body=Buffer.from(JSON.stringify({id,tenantId:f.tenant,role:'SUPER_ADMIN',exp:Date.now()/1000+60})).toString('base64url');return 'Bearer '+head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
 const app=require('../backends/express-api/node_modules/fastify')();let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
 try{
  await app.register(require('../backends/express-api/src/domains/crm/catalogRoutes.ts').default,{prefix:'/catalog'});
  eq((await app.inject({url:'/catalog/'})).statusCode,401);
  eq((await app.inject({url:'/catalog/',headers:{authorization:token(f.customerUser)}})).statusCode,403);
  eq((await app.inject({url:'/catalog/'+f.product,headers:{authorization:token(f.techUser)}})).statusCode,404);
  const selected=await app.inject({url:'/catalog/'+f.product+'?job_id='+f.job,headers:{authorization:token(f.techUser)}});
  eq(selected.statusCode,200);eq(selected.json().versions.length,1);eq(selected.json().events,[]);eq('review_checks' in selected.json().versions[0],false);eq(selected.headers['cache-control'],'no-store');
  eq((await app.inject({method:'POST',url:'/catalog/'+f.product+'/activate',headers:{authorization:token(f.techUser)},payload:{job_id:f.job,role:'MANAGER'}})).statusCode,403);
  eq((await app.inject({url:'/catalog/'+f.product+'/documents/'+f.document+'?job_id='+f.job,headers:{authorization:token(f.techUser)}})).statusCode,200);
  const gql=require('../backends/graphql-api/src/domains/crm/catalogResolvers.ts').catalogResolvers;
  await assert.rejects(gql.Query.catalogProduct(null,{id:f.product},{authorization:token(f.techUser)}),e=>e.extensions.status===404);count++;
  eq((await gql.Query.catalogProduct(null,{id:f.product,job_id:f.job},{authorization:token(f.techUser)})).versions[0].revision,f.revision);
  await assert.rejects(gql.Mutation.catalogCommand(null,{action:'activate',input:{id:f.product,job_id:f.job,revision:f.revision}},{authorization:token(f.techUser)}),e=>e.extensions.status===403);count++;
  const {buildSchema,graphql}=require('../backends/graphql-api/node_modules/graphql'),schema=buildSchema(require('../backends/graphql-api/src/typeDefs.ts').typeDefs);
  const result=await graphql({schema,source:'{ catalogSettings }',rootValue:{catalogSettings:()=>gql.Query.catalogSettings(null,{}, {authorization:token(f.manager)})}});
  eq(result.errors,undefined);eq(result.data.catalogSettings.enabled,true);
  console.log(count+' catalog transport checks passed');
 }finally{await app.close();Module._load=load;require.extensions['.ts']=oldTs;if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
}
