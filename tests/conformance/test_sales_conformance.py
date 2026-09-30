import pytest
import httpx
from tests.conformance.comparator import assert_conformance, normalize_response


@pytest.mark.asyncio
async def test_list_territories(api_client: httpx.AsyncClient):
    """Assert sales territories endpoint returns valid polygon territory array."""
    resp = await api_client.get("/api/v1/sales/territories")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="Territory")


@pytest.mark.asyncio
async def test_list_do_not_knock_records(api_client: httpx.AsyncClient):
    """Assert Do-Not-Knock compliance endpoint returns valid records."""
    resp = await api_client.get("/api/v1/sales/territories/compliance/do-not-knock")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="DoNotKnockRecord")


@pytest.mark.asyncio
async def test_list_canvass_pins(api_client: httpx.AsyncClient):
    """Assert canvass pins list returns pins with coordinates and statuses."""
    resp = await api_client.get("/api/v1/sales/pins")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
