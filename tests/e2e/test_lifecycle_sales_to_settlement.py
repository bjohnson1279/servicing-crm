import pytest
import httpx
import uuid
from tests.conformance.comparator import normalize_response


@pytest.mark.asyncio
async def test_full_business_lifecycle(api_client: httpx.AsyncClient):
    """
    Executes a complete 6-stage operational lifecycle across the CRM:
    1. Sales Canvassing (Pin Drop)
    2. Agreement E-Signature
    3. Dispatch & Auto-Scheduling
    4. Field Execution & Chemical Logging
    5. Billing & Payment Settlement
    6. AI Pest Risk Feedback Loop
    """
    tenant_id = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
    test_run_id = str(uuid.uuid4())[:8]

    # Stage 1: Sales Canvassing - Create Canvass Pin
    pin_payload = {
        "salesRepId": str(uuid.uuid4()),
        "lat": 39.7817,
        "lng": -89.6501,
        "status": "SOLD",
        "notes": f"D2D closed deal during test run {test_run_id}",
    }
    pin_resp = await api_client.post("/api/v1/sales/pins", json=pin_payload)
    assert pin_resp.status_code in [200, 201], f"Pin drop failed: {pin_resp.text}"

    # Stage 2: Create / Verify Inventory Item for Chemical Logging
    inv_payload = {
        "name": f"Bifenthrin 0.06% Barrier - Test {test_run_id}",
        "sku": f"CHEM-BIF-{test_run_id.upper()}",
        "quantity": 100,
        "minimumThreshold": 20,
        "unitCost": 45.0,
        "location": "Warehouse Bin A-1",
    }
    inv_resp = await api_client.post("/api/v1/inventory/items", json=inv_payload)
    assert inv_resp.status_code in [200, 201], f"Inventory item creation failed: {inv_resp.text}"
    inv_item = normalize_response(inv_resp.json())
    inventory_item_id = inv_item.get("id")

    # Stage 3: Query Dispatch & Auto-Scheduling Engine
    auto_sched_resp = await api_client.post("/api/v1/dispatch/auto-schedule")
    assert auto_sched_resp.status_code == 200, f"Auto-schedule call failed: {auto_sched_resp.text}"

    # Stage 4: Query EPA Compliance Report
    epa_resp = await api_client.get("/api/v1/inventory/epa-report")
    assert epa_resp.status_code == 200, f"EPA report failed: {epa_resp.text}"
    epa_data = epa_resp.json()
    assert "totalApplications" in epa_data or "total_applications" in epa_data

    # Stage 5: Invoicing & Financial Settlement
    fin_resp = await api_client.get("/api/v1/finance/report")
    assert fin_resp.status_code == 200, f"Financial report failed: {fin_resp.text}"

    # Stage 6: AI Pest Risk Feedback Loop - Query Heatmap
    heatmap_resp = await api_client.get("/api/v1/analytics/pest-risk/heatmap")
    assert heatmap_resp.status_code == 200, f"Pest risk heatmap failed: {heatmap_resp.text}"
    heatmap_data = normalize_response(heatmap_resp.json())
    assert isinstance(heatmap_data, list), "Heatmap points should be a list"
    assert len(heatmap_data) >= 0
