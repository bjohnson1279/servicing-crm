"""Test the FastAPI adapter's signed identity boundary without a live database."""
import base64
import hashlib
import hmac
import importlib.util
import json
import sys
import time
import types
from pathlib import Path

import pytest
from fastapi import HTTPException


@pytest.fixture
def actor(monkeypatch):
    # Only replace database imports; exercise the actual adapter and auth code.
    database = types.ModuleType('app.core.database')
    database.get_db = lambda: None
    database.AsyncSessionLocal = None
    models = types.ModuleType('app.models')
    models.callbacks = None
    monkeypatch.setitem(sys.modules,'app.core.database',database)
    monkeypatch.setitem(sys.modules,'app.models',models)
    monkeypatch.setenv('JWT_SECRET','callback-test-signing-key')
    path = Path(__file__).resolve().parents[1] / 'backends/fastapi-api/app/domains/crm/routes_callbacks.py'
    spec = importlib.util.spec_from_file_location('callbacks_auth_under_test',path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.callback_actor


def token(claims,algorithm='HS256'):
    encode = lambda data: base64.urlsafe_b64encode(data).rstrip(b'=').decode()
    value = encode(json.dumps({'alg':algorithm}).encode()) + '.' + encode(json.dumps(claims).encode())
    return 'Bearer ' + value + '.' + encode(hmac.new(b'callback-test-signing-key',value.encode(),hashlib.sha256).digest())


def test_valid_identity(actor):
    claims = dict(id='20000000-0000-0000-0000-000000000002',tenantId='10000000-0000-0000-0000-000000000001',exp=time.time()+3600)
    assert actor(token(claims)) == (claims['tenantId'],claims['id'])


@pytest.mark.parametrize('change,algorithm',[
    ({'exp':1},'HS256'), ({'exp':'99999999999'},'HS256'), ({'exp':True},'HS256'),
    ({'nbf':time.time()+7200},'HS256'), ({'id':[]},'HS256'), ({},'none'),
])
def test_invalid_signed_claims(actor,change,algorithm):
    claims = dict(id='20000000-0000-0000-0000-000000000002',tenantId='10000000-0000-0000-0000-000000000001',exp=time.time()+3600)
    with pytest.raises(HTTPException) as error:
        actor(token({**claims,**change},algorithm))
    assert error.value.status_code == 401


def test_missing_identity(actor):
    with pytest.raises(HTTPException) as error:
        actor(None)
    assert error.value.status_code == 401
