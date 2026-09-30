import pytest
import httpx
from tests.conformance.comparator import assert_conformance, normalize_response


@pytest.mark.asyncio
async def test_list_chat_conversations(api_client: httpx.AsyncClient):
    """Assert chat conversations endpoint returns valid conversation list."""
    resp = await api_client.get("/api/v1/comms/chat/conversations")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        assert_conformance(normalized[0], expected_schema="ChatConversation")


@pytest.mark.asyncio
async def test_list_canned_responses(api_client: httpx.AsyncClient):
    """Assert canned response templates endpoint returns valid template array."""
    resp = await api_client.get("/api/v1/comms/chat/canned-responses")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    normalized = normalize_response(data)
    assert isinstance(normalized, list)
    if len(normalized) > 0:
        item = normalized[0]
        assert "shortcut" in item
        assert "content" in item
