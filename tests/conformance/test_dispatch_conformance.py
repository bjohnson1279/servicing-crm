import pytest
import httpx
from tests.conformance.comparator import assert_conformance, normalize_response


@pytest.mark.asyncio
async def test_list_jobs(api_client: httpx.AsyncClient):
    """Assert all backends return valid Job arrays conforming to golden schema."""
    resp = await api_client.get("/api/v1/jobs")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list), "Expected list of jobs"
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="Job")


@pytest.mark.asyncio
async def test_list_inventory_items(api_client: httpx.AsyncClient):
    """Assert all backends return inventory items conforming to golden schema."""
    resp = await api_client.get("/api/v1/inventory/items")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list), "Expected list of inventory items"
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="InventoryItem")


@pytest.mark.asyncio
async def test_epa_compliance_report(api_client: httpx.AsyncClient):
    """Assert EPA compliance report endpoint returns required summary metrics."""
    resp = await api_client.get("/api/v1/inventory/epa-report")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert_conformance(data, expected_schema="EpaReport")


@pytest.mark.asyncio
async def test_technicians_list(api_client: httpx.AsyncClient):
    """Assert technician list endpoint returns valid technician objects."""
    resp = await api_client.get("/api/v1/technicians")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list), "Expected list of technicians"
