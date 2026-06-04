import logging
import httpx
from app.polymarket.models import MarketData

logger = logging.getLogger(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"


class PolymarketClient:
    def __init__(self):
        self.http = httpx.AsyncClient(timeout=30, headers={"Accept": "application/json"})

    async def close(self):
        await self.http.aclose()

    async def get_markets(self, limit: int = 100, offset: int = 0, active: bool = True) -> list[MarketData]:
        """Fetch markets from Gamma API."""
        try:
            resp = await self.http.get(
                f"{GAMMA_API}/markets",
                params={
                    "limit": limit,
                    "offset": offset,
                    "active": str(active).lower(),
                    "closed": "false",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            markets = []
            for m in data:
                try:
                    outcomes = m.get("outcomes", "[]")
                    if isinstance(outcomes, str):
                        import json
                        outcomes = json.loads(outcomes)

                    prices_str = m.get("outcomePrices", "[]")
                    if isinstance(prices_str, str):
                        import json
                        prices = [float(p) for p in json.loads(prices_str)]
                    else:
                        prices = [float(p) for p in (prices_str or [])]

                    markets.append(MarketData(
                        condition_id=m.get("conditionId", m.get("id", "")),
                        question=m.get("question", ""),
                        description=m.get("description", ""),
                        category=m.get("category", ""),
                        outcomes=outcomes,
                        outcome_prices=prices,
                        volume_24h=float(m.get("volume24hr", 0) or 0),
                        total_volume=float(m.get("volume", 0) or 0),
                        liquidity=float(m.get("liquidity", 0) or 0),
                        end_date=m.get("endDate"),
                        active=m.get("active", True),
                        tags=m.get("tags", []) or [],
                        spread=float(m.get("spread", 0) or 0),
                        best_bid=float(m.get("bestBid", 0) or 0),
                        best_ask=float(m.get("bestAsk", 0) or 0),
                    ))
                except Exception as e:
                    logger.debug(f"Skipping malformed market: {e}")
                    continue

            return markets
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch markets: {e}")
            return []

    async def get_market(self, condition_id: str) -> MarketData | None:
        """Fetch a single market by condition ID."""
        try:
            resp = await self.http.get(f"{GAMMA_API}/markets/{condition_id}")
            resp.raise_for_status()
            m = resp.json()
            return MarketData(
                condition_id=m.get("conditionId", condition_id),
                question=m.get("question", ""),
                description=m.get("description", ""),
                outcomes=m.get("outcomes", []),
                outcome_prices=[float(p) for p in m.get("outcomePrices", [])],
                volume_24h=float(m.get("volume24hr", 0) or 0),
                total_volume=float(m.get("volume", 0) or 0),
                liquidity=float(m.get("liquidity", 0) or 0),
                end_date=m.get("endDate"),
                active=m.get("active", True),
                tags=m.get("tags", []) or [],
            )
        except Exception as e:
            logger.error(f"Failed to fetch market {condition_id}: {e}")
            return None

    async def get_all_active_markets(self, max_pages: int = 10) -> list[MarketData]:
        """Paginate through all active markets."""
        all_markets = []
        for page in range(max_pages):
            markets = await self.get_markets(limit=100, offset=page * 100)
            if not markets:
                break
            all_markets.extend(markets)
            if len(markets) < 100:
                break
        return all_markets
