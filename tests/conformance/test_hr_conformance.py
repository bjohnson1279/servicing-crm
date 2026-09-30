import pytest
import httpx
from tests.conformance.comparator import normalize_response


@pytest.mark.asyncio
async def test_staff_directory(api_client: httpx.AsyncClient):
    """Assert staff directory returns user/employee array."""
    resp = await api_client.get("/api/v1/hr/staff")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)


@pytest.mark.asyncio
async def test_training_courses(api_client: httpx.AsyncClient):
    """Assert training courses list returns courses array."""
    resp = await api_client.get("/api/v1/hr/courses")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
