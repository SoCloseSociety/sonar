import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session
from app.models.market import Market, MarketSnapshot
from app.polymarket.client import PolymarketClient
from app.polymarket.models import MarketDelta
from app.websocket import emit_event

logger = logging.getLogger(__name__)
settings = get_settings()


class MarketTracker:
    def __init__(self):
        self.client = PolymarketClient()
        self.previous_prices: dict[str, float] = {}

    async def run(self):
        """Main loop: scan markets every interval."""
        logger.info("MarketTracker started")
        while True:
            try:
                await self.scan_and_update()
            except Exception as e:
                logger.error(f"MarketTracker error: {e}")
            await asyncio.sleep(settings.scan_interval_seconds)

    async def scan_and_update(self):
        markets_data = await self.client.get_all_active_markets()
        if not markets_data:
            return

        logger.info(f"Fetched {len(markets_data)} active markets")
        deltas = []

        async with async_session() as db:
            # Batch fetch all existing markets by condition_id (1 query instead of N)
            condition_ids = [m.condition_id for m in markets_data]
            result = await db.execute(
                select(Market).where(Market.condition_id.in_(condition_ids))
            )
            existing_markets = {m.condition_id: m for m in result.scalars().all()}

            now = datetime.now(timezone.utc)
            snapshots_to_add = []

            for market_data in markets_data:
                market = existing_markets.get(market_data.condition_id)

                if market is None:
                    market = Market(
                        condition_id=market_data.condition_id,
                        question=market_data.question,
                        description=market_data.description,
                        category=market_data.category,
                        outcomes={"outcomes": market_data.outcomes, "prices": market_data.outcome_prices},
                        end_date=market_data.end_date,
                        active=market_data.active,
                        tags=market_data.tags,
                    )
                    db.add(market)
                    await db.flush()
                    existing_markets[market_data.condition_id] = market
                else:
                    market.outcomes = {"outcomes": market_data.outcomes, "prices": market_data.outcome_prices}
                    market.active = market_data.active
                    if market_data.category and not market.category:
                        market.category = market_data.category
                    if market_data.tags and not market.tags:
                        market.tags = market_data.tags
                    market.updated_at = now

                # Save snapshot
                price_yes = market_data.outcome_prices[0] if market_data.outcome_prices else None
                price_no = market_data.outcome_prices[1] if len(market_data.outcome_prices) > 1 else None

                snapshots_to_add.append(MarketSnapshot(
                    market_id=market.id,
                    price_yes=price_yes,
                    price_no=price_no,
                    volume_24h=market_data.volume_24h,
                    total_volume=market_data.total_volume,
                    liquidity=market_data.liquidity,
                    spread=market_data.spread,
                    best_bid=market_data.best_bid,
                    best_ask=market_data.best_ask,
                ))

                # Calculate delta
                old_price = self.previous_prices.get(market_data.condition_id, price_yes)
                if price_yes is not None and old_price is not None:
                    change = price_yes - old_price
                    if abs(change) > 0.01:
                        deltas.append(MarketDelta(
                            condition_id=market_data.condition_id,
                            question=market_data.question,
                            price_change=change,
                            volume_change=market_data.volume_24h,
                            old_price=old_price,
                            new_price=price_yes,
                            direction="up" if change > 0 else "down",
                        ))
                    self.previous_prices[market_data.condition_id] = price_yes

            # Batch add all snapshots
            db.add_all(snapshots_to_add)
            await db.commit()

        # Emit deltas via WebSocket
        if deltas:
            for delta in deltas:
                await emit_event("markets", "market_update", delta.model_dump())

        logger.info(f"Updated {len(markets_data)} markets, {len(deltas)} significant moves")
