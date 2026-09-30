import pytest
import httpx
from tests.conformance.comparator import assert_conformance, normalize_response


@pytest.mark.asyncio
async def test_list_customers(api_client: httpx.AsyncClient):
    """Assert all backends return customer array."""
    resp = await api_client.get("/api/v1/customers")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)


@pytest.mark.asyncio
async def test_list_contracts(api_client: httpx.AsyncClient):
    """Assert service contracts match golden contract schema."""
    resp = await api_client.get("/api/v1/contracts")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="ServiceContract")
