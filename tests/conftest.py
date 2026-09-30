import os
import json
from pathlib import Path
from typing import Dict, Any, AsyncGenerator
from urllib.parse import urlparse
import socket
from functools import lru_cache
import pytest
import pytest_asyncio
import httpx

FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "seed_data.json"

DEFAULT_BACKENDS = {
    "express": os.getenv("EXPRESS_API_URL", "http://localhost:3182"),
    "fastapi": os.getenv("FASTAPI_API_URL", "http://localhost:3184"),
    "graphql": os.getenv("GRAPHQL_API_URL", "http://localhost:3183"),
    "laravel": os.getenv("LARAVEL_API_URL", "http://localhost:3181"),
}

FALLBACK_BACKENDS = {
    "express": "http://localhost:8000",
    "fastapi": "http://localhost:8002",
    "graphql": "http://localhost:8003",
    "laravel": "http://localhost:8004",
}

DEFAULT_TENANT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"


@pytest.fixture(scope="session")
def seed_data() -> Dict[str, Any]:
    if FIXTURES_PATH.exists():
        with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "tenantId": DEFAULT_TENANT_ID,
        "customerId": "c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c",
        "propertyId": "b8a5b28a-7c9e-4b45-a1d2-7c98b63481e1",
        "technicianId": "e7f8a9b0-c1d2-4e3f-8a9b-0c1d2e3f4a5b",
    }


def is_tcp_open(url: str, timeout: float = 0.1) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        if host == "localhost":
            host = "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@lru_cache(maxsize=32)
def resolve_backend_url(backend_name: str) -> str:
    """Find reachable URL for backend verifying service identity, or return empty string if offline."""
    candidates = []
    env_key = f"{backend_name.upper()}_API_URL"
    if os.getenv(env_key):
        candidates.append(os.getenv(env_key))
    if backend_name in DEFAULT_BACKENDS and DEFAULT_BACKENDS[backend_name] not in candidates:
        candidates.append(DEFAULT_BACKENDS[backend_name])
    if backend_name in FALLBACK_BACKENDS and FALLBACK_BACKENDS[backend_name] not in candidates:
        candidates.append(FALLBACK_BACKENDS[backend_name])

    expected_service = f"{backend_name}-api"

    for url in candidates:
        if not is_tcp_open(url):
            continue
        try:
            with httpx.Client(timeout=0.6) as client:
                for path in ["/health", "/api/v1/health"]:
                    try:
                        resp = client.get(f"{url}{path}")
                        if resp.status_code == 200:
                            data = resp.json()
                            if data.get("service") == expected_service:
                                return url
                    except Exception:
                        pass
        except Exception:
            pass
    return ""


@pytest.fixture(params=["express", "fastapi", "graphql", "laravel"])
def backend_name(request) -> str:
    return request.param


@pytest.fixture
def backend_base_url(backend_name: str) -> str:
    url = resolve_backend_url(backend_name)
    if not url:
        pytest.skip(f"Backend '{backend_name}' is offline")
    return url


@pytest_asyncio.fixture
async def api_client(backend_base_url: str) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Asynchronous HTTP client pre-configured with tenant context and default headers."""
    headers = {
        "X-Tenant-Id": DEFAULT_TENANT_ID,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(
        base_url=backend_base_url,
        headers=headers,
        timeout=10.0,
    ) as client:
        yield client
