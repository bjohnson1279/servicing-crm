import pytest
import httpx
from tests.conformance.comparator import assert_conformance, normalize_response


@pytest.mark.asyncio
async def test_list_invoices(api_client: httpx.AsyncClient):
    """Assert all backends return invoice records matching golden schema."""
    # Check finance/invoices or /invoices
    resp = await api_client.get("/api/v1/finance/invoices")
    if resp.status_code == 404:
        resp = await api_client.get("/api/v1/invoices")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="Invoice")


@pytest.mark.asyncio
async def test_list_quotes(api_client: httpx.AsyncClient):
    """Assert quotes list endpoint matches golden schema."""
    resp = await api_client.get("/api/v1/finance/quotes")
    if resp.status_code == 404:
        resp = await api_client.get("/api/v1/quotes")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="Quote")


@pytest.mark.asyncio
async def test_financial_report(api_client: httpx.AsyncClient):
    """Assert financial report returns total revenue and invoice counts."""
    resp = await api_client.get("/api/v1/finance/report")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert "totalRevenue" in normalized or "total_revenue" in data or "paidRevenue" in normalized
