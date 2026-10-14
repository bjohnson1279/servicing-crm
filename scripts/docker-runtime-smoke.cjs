// Run inside the Express container:
// Get-Content -Raw scripts/docker-runtime-smoke.cjs | docker compose exec -T express-api node
const { PrismaClient } = require('@prisma/client');
const { createHmac } = require('crypto');
async function main() {
 const db = new PrismaClient();
 try {
  const user = await db.user.findFirst({ where: { role: { in: ['SUPER_ADMIN', 'MANAGER'] } }, select: { id: true, tenantId: true, role: true } });
  if (!user) throw new Error('Seeded staff actor required for runtime verification');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({alg:'HS256',typ:'JWT'});
  const payload = encode({id:user.id,tenantId:user.tenantId,role:user.role,exp:Math.floor(Date.now()/1000)+600});
  const unsigned = header+'.'+payload;
  const token = unsigned+'.'+createHmac('sha256',process.env.JWT_SECRET).update(unsigned).digest('base64url');
  const backends = [
   ['express-api','/health','/api/v1/jobs'],
   ['graphql-api','/health','/api/jobs'],
   ['fastapi-api','/health','/api/v1/jobs'],
   ['laravel-api','/api/v1/health','/api/v1/jobs']
  ];
  const selected = (process.env.CRM_SMOKE_BACKENDS || backends.map(([name])=>name).join(',')).split(',');
  if (selected.some(name=>!backends.some(([service])=>service===name))) throw new Error('Unknown CRM_SMOKE_BACKENDS service');
  const settings=['inspections','devices','catalog','recurring','profitability','commercial'];
  let failures = 0;
  async function check(service, port, route, expected, signed=true, options={}) {
   try {
    const response=await fetch('http://'+service+':'+port+route,{
     ...options,headers:{Accept:'application/json',...(signed?{Authorization:'Bearer '+token}:{}),...options.headers},
     signal:AbortSignal.timeout(20000)});
    if (response.status!==expected) throw new Error('Expected '+expected+', got '+response.status);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Expected JSON response');
    const body = await response.json();
    if (route === '/graphql' && (body.errors || body.data?.__typename !== 'Query')) {
      throw new Error('GraphQL response did not execute the query');
    }
    console.log('PASS '+service+' '+route+' '+response.status);
   } catch(error) { failures++; console.error('FAIL '+service+' '+route+': '+error.message); }
  }
  for (const [service,health,jobs] of backends.filter(([service])=>selected.includes(service))) {
   await check(service,8000,health,200,false);
   await check(service,8000,jobs,200);
   for(const feature of settings) await check(service,8000,'/api/v1/'+feature+'/settings',200);
   await check(service,8000,'/api/v1/commercial/settings',401,false);
  }
  if(selected.includes('graphql-api')) await check('graphql-api',8000,'/graphql',200,true,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'{ __typename }'})});
  if(selected.includes('express-api')) for(const [service,port] of [['admin-portal',3000],['customer-portal',3001],['tech-portal',3002]]) {
   await check(service,port,'/api/v1/commercial/settings',200);
   await check(service,port,'/api/v1/commercial/settings',401,false);
  }
  if(failures) process.exitCode=1;
 } finally { await db.$disconnect(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
