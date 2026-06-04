import logging
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.polymarket.client import PolymarketClient

logger = logging.getLogger(__name__)


class PolymarketSource(BaseSource):
    """Generates events from significant Polymarket price movements."""
    name = "polymarket"
    interval = 300
    credibility = 8.0

    def __init__(self):
        super().__init__()
        self.client = PolymarketClient()
        self._previous_prices: dict[str, float] = {}

    async def fetch(self) -> list[RawEvent]:
        events = []
        markets = await self.client.get_all_active_markets(max_pages=10)

        for market in markets:
            if not market.outcome_prices:
                continue

            price = market.outcome_prices[0]
            prev = self._previous_prices.get(market.condition_id)
            self._previous_prices[market.condition_id] = price

            if prev is None:
                continue

            change = price - prev
            pct_change = (change / prev * 100) if prev > 0 else 0

            # Only report large moves (>15%) to reduce noise
            # Skip low-volume markets and sports/entertainment
            if abs(pct_change) >= 15 and (market.volume_24h or 0) > 1000:
                q_lower = market.question.lower()
                # Filter out sports/entertainment markets
                SPORTS_NOISE = {"nba", "nfl", "nhl", "mlb", "premier league", "la liga",
                                "serie a", "bundesliga", "ligue 1", "champions league",
                                "world cup", "super bowl", "goal scorer", "mvp", "playoffs",
                                "f1", "formula", "ufc", "boxing", "tennis", "oscar", "grammy",
                                "emmy", "bachelor", "survivor", "big brother"}
                if any(term in q_lower for term in SPORTS_NOISE):
                    continue

                direction = "UP" if change > 0 else "DOWN"
                events.append(RawEvent(
                    source="polymarket",
                    text=f"Polymarket: \"{market.question}\" moved {direction} {abs(pct_change):.1f}% (now {price:.0%})",
                    credibility=8.0,
                    metadata={
                        "condition_id": market.condition_id,
                        "old_price": prev,
                        "new_price": price,
                        "change_pct": pct_change,
                        "volume_24h": market.volume_24h,
                    },
                ))

        return events
