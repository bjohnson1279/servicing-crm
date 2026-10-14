"""Exercise actual FastAPI transport identity, route IDs and rollback boundary."""
import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path
import pytest
from fastapi import HTTPException
from test_callback_auth import actor, token
from test_job_adapters import DB

@pytest.fixture
def profitability(actor,monkeypatch):
    sys.modules['app.models'].profitability=None
    callbacks=types.ModuleType('app.domains.crm.routes_callbacks');callbacks.callback_actor=actor
    monkeypatch.setitem(sys.modules,'app.domains.crm.routes_callbacks',callbacks)
    path=Path(__file__).resolve().parents[1]/'backends/fastapi-api/app/domains/crm/routes_profitability.py'
    spec=importlib.util.spec_from_file_location('profitability_adapter_under_test',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def request(body=None,authorization=True):
    import time
    claims={'id':'20000000-0000-0000-0000-000000000002','tenantId':'10000000-0000-0000-0000-000000000001','role':'SUPER_ADMIN','exp':time.time()+60}
    async def read():return json.dumps(body or {}).encode()
    return types.SimpleNamespace(headers={'authorization':token(claims)} if authorization else {},method='POST',body=read,query_params={},path_params={'id':'route-id'}),claims

def test_verified_identity_and_route_id(profitability):
    req,claims=request({'id':'forged','tenant_id':'forged','role':'MANAGER'});db=DB()
    asyncio.run(profitability.command(req,db,'get'))
    sql,params=db.calls[0]
    assert 'profitability_api' in sql and params['tenant']==claims['tenantId'] and params['actor']==claims['id']
    assert json.loads(params['body'])['id']=='route-id' and db.committed

def test_unauthenticated_never_queries(profitability):
    req,_=request(authorization=False);db=DB()
    with pytest.raises(HTTPException) as exc:asyncio.run(profitability.command(req,db,'get'))
    assert exc.value.status_code==401 and not db.calls

@pytest.mark.parametrize('code,status',[('P0403',403),('P0404',404),('P0409',409),('P0503',503),('22P02',400),('XX000',500)])
def test_errors_roll_back_and_hide_internals(profitability,code,status):
    req,_=request();db=DB(code)
    with pytest.raises(HTTPException) as exc:asyncio.run(profitability.command(req,db,'get'))
    assert exc.value.status_code==status and db.rolled_back and not db.committed
    assert 'sensitive' not in exc.value.detail