import pytest
from app.polymarket.client import PolymarketClient


@pytest.mark.asyncio
async def test_polymarket_client_fetch():
    """Test that Polymarket client can fetch markets."""
    client = PolymarketClient()
    try:
        markets = await client.get_markets(limit=5)
        assert isinstance(markets, list)
        if markets:
            m = markets[0]
            assert m.condition_id
            assert m.question
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_polymarket_empty_response():
    """Test handling of empty/error responses."""
    client = PolymarketClient()
    try:
        # Fetch with very high offset should return empty
        markets = await client.get_markets(limit=1, offset=999999)
        assert isinstance(markets, list)
    finally:
        await client.close()
