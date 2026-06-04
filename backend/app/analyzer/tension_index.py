import asyncio
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func

from app.config import get_settings
from app.database import async_session
from app.models.event import Event
from app.models.tracking import FlightTrack, VesselTrack, TrackingAnomaly
from app.models.tension import TensionHistory
from app.websocket import emit_to_all

logger = logging.getLogger(__name__)
settings = get_settings()

TENSION_LEVELS = {
    (0, 2): "CALM",
    (2, 4): "GUARDED",
    (4, 6): "ELEVATED",
    (6, 8): "HIGH",
    (8, 10): "CRITICAL",
}


def get_level(score: float) -> str:
    for (low, high), level in TENSION_LEVELS.items():
        if low <= score < high:
            return level
    return "CRITICAL" if score >= 10 else "CALM"


class TensionCalculator:
    """Calculates the Global Tension Index (0-10)."""

    def __init__(self):
        self._previous_score: float | None = None

    async def run(self):
        logger.info("TensionCalculator started")
        while True:
            try:
                await self.calculate_and_store()
            except Exception as e:
                logger.error(f"Tension calculation error: {e}")
            await asyncio.sleep(settings.tension_update_interval)

    async def calculate_and_store(self):
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            three_hours_ago = now - timedelta(hours=3)
            six_hours_ago = now - timedelta(hours=6)
            twenty_four_hours_ago = now - timedelta(hours=24)

            # Single query with all 8 counts as scalar subqueries (~8x faster)
            combined = await db.execute(
                select(
                    # Factor 1a: avg severity (6h)
                    select(func.avg(Event.severity))
                    .where(Event.created_at > six_hours_ago)
                    .where(Event.severity > 0)
                    .correlate(None).scalar_subquery().label("avg_sev"),
                    # Factor 1b: unique category:country pairs (6h)
                    select(func.count(func.distinct(
                        func.concat(Event.category, ':', func.coalesce(Event.country, ''))
                    )))
                    .where(Event.created_at > six_hours_ago)
                    .where(Event.severity > 0)
                    .correlate(None).scalar_subquery().label("unique_events"),
                    # Factor 2: military flights (6h)
                    select(func.count(FlightTrack.id))
                    .where(FlightTrack.is_military == True)
                    .where(FlightTrack.captured_at > six_hours_ago)
                    .correlate(None).scalar_subquery().label("mil_flights"),
                    # Factor 3: tracking anomalies (24h)
                    select(func.count(TrackingAnomaly.id))
                    .where(TrackingAnomaly.detected_at > twenty_four_hours_ago)
                    .correlate(None).scalar_subquery().label("anomalies"),
                    # Factor 4: conflict events (24h)
                    select(func.count(Event.id))
                    .where(Event.category.in_(["MILITARY_CONFLICT", "TERRORISM", "MARITIME_SECURITY"]))
                    .where(Event.created_at > twenty_four_hours_ago)
                    .correlate(None).scalar_subquery().label("conflicts"),
                    # Factor 5: high severity events (6h)
                    select(func.count(Event.id))
                    .where(Event.severity >= 7)
                    .where(Event.created_at > six_hours_ago)
                    .correlate(None).scalar_subquery().label("high_sev"),
                    # Factor 6: critical category events (24h)
                    select(func.count(Event.id))
                    .where(Event.category.in_(["NUCLEAR", "CYBER_ATTACK", "SANCTIONS"]))
                    .where(Event.created_at > twenty_four_hours_ago)
                    .correlate(None).scalar_subquery().label("critical"),
                    # Factor 7a: recent events (last 3h)
                    select(func.count(Event.id))
                    .where(Event.created_at > three_hours_ago)
                    .where(Event.severity > 0)
                    .correlate(None).scalar_subquery().label("recent_3h"),
                    # Factor 7b: older events (3-6h ago)
                    select(func.count(Event.id))
                    .where(Event.created_at > six_hours_ago)
                    .where(Event.created_at <= three_hours_ago)
                    .where(Event.severity > 0)
                    .correlate(None).scalar_subquery().label("older_3h"),
                )
            )
            row = combined.one()

            # Factor 1: Event severity (25%)
            avg_severity = float(row.avg_sev or 0)
            unique_count = row.unique_events or 1
            diversity_bonus = min(1.0, unique_count / 15)
            event_factor = min(10, avg_severity * (1 + diversity_bonus * 0.5)) / 10 * 2.5

            # Factor 2: Military flight activity (15%)
            mil_count = row.mil_flights or 0
            flight_factor = min(10, mil_count / 50) / 10 * 1.5

            # Factor 3: Naval movement anomalies (15%)
            anomaly_count = row.anomalies or 0
            naval_factor = min(10, anomaly_count / 5) / 10 * 1.5

            # Factor 4: Active conflict events (15%)
            conflict_count = row.conflicts or 0
            conflict_factor = min(10, conflict_count / 10) / 10 * 1.5

            # Factor 5: High severity event count (15%)
            high_count = row.high_sev or 0
            high_sev_factor = min(10, high_count / 5) / 10 * 1.5

            # Factor 6: Critical categories (10%)
            critical_count = row.critical or 0
            critical_factor = min(10, critical_count * 2) / 10 * 1.0

            # Factor 7: Velocity — event rate acceleration (5%)
            recent_count = row.recent_3h or 0
            older_count = row.older_3h or 1
            velocity_ratio = recent_count / max(older_count, 1)
            velocity_factor = min(10, max(0, (velocity_ratio - 1) * 5)) / 10 * 0.5

            # Total
            score = (
                event_factor + flight_factor + naval_factor +
                conflict_factor + high_sev_factor + critical_factor + velocity_factor
            )
            score = min(10.0, max(0.0, round(score, 1)))
            level = get_level(score)

            breakdown = {
                "event_severity": round(event_factor, 2),
                "military_flights": round(flight_factor, 2),
                "naval_anomalies": round(naval_factor, 2),
                "conflict_events": round(conflict_factor, 2),
                "high_severity": round(high_sev_factor, 2),
                "critical_categories": round(critical_factor, 2),
                "velocity": round(velocity_factor, 2),
            }

            # Store
            tension = TensionHistory(score=score, level=level, breakdown=breakdown)
            db.add(tension)
            await db.commit()

            # Determine trend
            trend = "stable"
            if self._previous_score is not None:
                diff = score - self._previous_score
                if diff > 0.3:
                    trend = "rising"
                elif diff < -0.3:
                    trend = "falling"

            self._previous_score = score

            # Emit to all connected clients
            await emit_to_all("tension_update", {
                "score": score,
                "level": level,
                "trend": trend,
                "breakdown": breakdown,
            })

            logger.info(f"Tension Index: {score} ({level}) trend={trend}")
