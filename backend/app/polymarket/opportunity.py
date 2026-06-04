import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.signal import Signal
from app.models.market import Market, MarketSnapshot
from app.polymarket.models import OpportunitySignal
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class OpportunityDetector:
    """Detects mispricing opportunities based on event-market correlations."""

    async def evaluate(
        self,
        db: AsyncSession,
        market_id: int,
        estimated_fair_value: float,
        confidence: float,
        reasoning: str,
        event_id: int | None = None,
    ) -> Signal | None:
        """Check if there's a tradeable edge and create a signal if so."""
        result = await db.execute(select(Market).where(Market.id == market_id))
        market = result.scalar_one_or_none()
        if not market:
            return None

        # Get latest snapshot
        snap_result = await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id == market_id)
            .order_by(MarketSnapshot.captured_at.desc())
            .limit(1)
        )
        snapshot = snap_result.scalar_one_or_none()
        if not snapshot or snapshot.price_yes is None:
            return None

        current_price = snapshot.price_yes
        edge = ((estimated_fair_value - current_price) / current_price) * 100 if current_price > 0 else 0

        if abs(edge) < settings.mispricing_min_pct or confidence < settings.signal_min_confidence:
            return None

        direction = "BUY_YES" if edge > 0 else "BUY_NO"
        signal_type = self._classify_signal(edge, confidence)

        signal = Signal(
            event_id=event_id,
            market_id=market_id,
            signal_type=signal_type,
            current_price=current_price,
            estimated_fair_value=estimated_fair_value,
            edge_pct=abs(edge),
            confidence=confidence,
            direction=direction,
            time_sensitivity=self._time_sensitivity(market),
            reasoning=reasoning,
            status="active",
        )
        db.add(signal)
        await db.flush()

        logger.info(f"Signal generated: {signal_type} on {market.question[:50]} (edge: {edge:.1f}%)")
        return signal

    def _classify_signal(self, edge: float, confidence: float) -> str:
        abs_edge = abs(edge)
        if abs_edge > 30 and confidence > 0.85:
            return "STRONG_MISPRICING"
        elif abs_edge > 20:
            return "MODERATE_MISPRICING"
        elif confidence > 0.9:
            return "HIGH_CONFIDENCE"
        else:
            return "EDGE_DETECTED"

    def _time_sensitivity(self, market: Market) -> str:
        if not market.end_date:
            return "normal"
        hours_to_expiry = (market.end_date - datetime.now(timezone.utc)).total_seconds() / 3600
        if hours_to_expiry < 6:
            return "urgent"
        elif hours_to_expiry < 24:
            return "high"
        return "normal"
