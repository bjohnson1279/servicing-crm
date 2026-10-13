"""Exercise FastAPI's actual adapter identity and database error boundary."""
import asyncio
import importlib.util
import json
import types
from pathlib import Path
import pytest
from fastapi import HTTPException
from test_callback_auth import actor, token

@pytest.fixture
def jobs(actor, monkeypatch):
    callbacks=types.ModuleType('app.domains.crm.routes_callbacks')
    callbacks.callback_actor=actor
    monkeypatch.setitem(__import__('sys').modules,'app.domains.crm.routes_callbacks',callbacks)
    path=Path(__file__).resolve().parents[1]/'backends/fastapi-api/app/domains/dispatch/routes_jobs.py'
    spec=importlib.util.spec_from_file_location('job_adapter_under_test',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class DB:
    def __init__(self,code=None): self.calls=[];self.code=code;self.committed=False;self.rolled_back=False
    async def execute(self,sql,params):
        self.calls.append((str(sql),params))
        if self.code:
            exc=Exception('sensitive database internals');exc.sqlstate=self.code;raise exc
        return types.SimpleNamespace(scalar_one=lambda:[])
    async def commit(self):self.committed=True
    async def rollback(self):self.rolled_back=True

def request():
    import time
    claims={'id':'20000000-0000-0000-0000-000000000002','tenantId':'10000000-0000-0000-0000-000000000001','role':'SUPER_ADMIN','exp':time.time()+60}
    return types.SimpleNamespace(headers={'authorization':token(claims)}),claims

def test_verified_identity_not_body_identity(jobs):
    req,claims=request();db=DB()
    asyncio.run(jobs.job_command(req,db,'create',{'tenantId':'forged','propertyId':'property'}))
    sql,params=db.calls[0]
    assert 'job_api' in sql and params['actor']==claims['id'] and params['tenant']==claims['tenantId']
    assert json.loads(params['body'])=={'tenant_id':'forged','property_id':'property'}
    assert db.committed

def test_unauthenticated_never_queries(jobs):
    db=DB()
    with pytest.raises(HTTPException) as exc:asyncio.run(jobs.job_command(types.SimpleNamespace(headers={}),db,'list',{}))
    assert exc.value.status_code==401 and not db.calls

@pytest.mark.parametrize('code,status',[('P0401',401),('P0403',403),('P0404',404),('P0409',409),('22P02',400),('XX000',500)])
def test_policy_errors_roll_back_and_hide_internals(jobs,code,status):
    req,_=request();db=DB(code)
    with pytest.raises(HTTPException) as exc:asyncio.run(jobs.job_command(req,db,'update',{}))
    assert exc.value.status_code==status and db.rolled_back and not db.committed
    assert 'sensitive' not in exc.value.detail
