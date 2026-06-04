import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, delete
from geoalchemy2.elements import WKTElement

from app.config import get_settings
from app.database import async_session
from app.models.event import Event
from app.redis_client import set_exists, set_add
from app.websocket import emit_event
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.ingestion.geocoder import geocode_event

logger = logging.getLogger(__name__)
settings = get_settings()

# Limit concurrent pipeline processing to prevent CPU overload
_pipeline_semaphore = asyncio.Semaphore(2)

# Max events to process per source per cycle (prevent flood)
MAX_EVENTS_PER_CYCLE = 30

# Singleton pipeline
_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        from app.analyzer.pipeline import AnalysisPipeline
        _pipeline = AnalysisPipeline()
    return _pipeline


class IngestionManager:
    """Orchestrates all ingestion sources."""

    def __init__(self):
        self.sources: list[BaseSource] = []
        self._init_sources()

    def _init_sources(self):
        from app.ingestion.sources.rss_feeds import RSSSource
        from app.ingestion.sources.earthquake import EarthquakeSource
        from app.ingestion.sources.weather_alerts import WeatherAlertSource
        from app.ingestion.sources.gdelt import GDELTSource
        from app.ingestion.sources.fire_satellite import FireSatelliteSource
        from app.ingestion.sources.flight_tracker import FlightTrackerSource
        from app.ingestion.sources.vessel_tracker import VesselTrackerSource
        from app.ingestion.sources.nuclear import NuclearSource
        from app.ingestion.sources.twitter import TwitterSource
        from app.ingestion.sources.telegram_mon import TelegramMonitorSource
        from app.ingestion.sources.webcams import WebcamSource
        from app.ingestion.sources.polymarket import PolymarketSource
        from app.ingestion.sources.youtube_live import YouTubeLiveSource
        from app.ingestion.sources.reddit_osint import RedditOSINTSource
        from app.ingestion.sources.acled import ACLEDSource
        from app.ingestion.sources.government_feeds import GovernmentFeedSource
        from app.ingestion.sources.liveuamap import ConflictMonitorSource
        from app.ingestion.sources.cyber_threats import CyberThreatSource
        from app.ingestion.sources.sanctions_trade import SanctionsTradeSource
        from app.ingestion.sources.shodan_monitor import ShodanMonitorSource

        source_map = [
            (RSSSource(), settings.enable_rss),
            (GDELTSource(), settings.enable_gdelt),
            (GovernmentFeedSource(), settings.enable_government_feeds),
            (ConflictMonitorSource(), settings.enable_conflict_monitor),
            (EarthquakeSource(), settings.enable_earthquake),
            (WeatherAlertSource(), settings.enable_weather),
            (FireSatelliteSource(), settings.enable_fire),
            (FlightTrackerSource(), settings.enable_flight_tracking),
            (VesselTrackerSource(), settings.enable_vessel_tracking),
            (NuclearSource(), settings.enable_nuclear),
            (YouTubeLiveSource(), settings.enable_youtube),
            (RedditOSINTSource(), settings.enable_reddit),
            (TwitterSource(), settings.enable_twitter),
            (TelegramMonitorSource(), settings.enable_telegram_monitor),
            (ACLEDSource(), settings.enable_acled),
            (CyberThreatSource(), settings.enable_cyber_threats),
            (SanctionsTradeSource(), settings.enable_sanctions_trade),
            (ShodanMonitorSource(), settings.enable_shodan),
            (PolymarketSource(), settings.enable_polymarket),
            (WebcamSource(), settings.enable_webcams),
        ]

        for source, enabled in source_map:
            source.enabled = enabled
            self.sources.append(source)

        logger.info(f"Initialized {len(self.sources)} sources ({sum(1 for s in self.sources if s.enabled)} enabled)")

    async def run(self):
        """Main loop: run all sources concurrently on their own intervals."""
        logger.info("IngestionManager started")
        tasks = [self._run_source(source) for source in self.sources]
        tasks.append(self._cleanup_tracking_data())
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _cleanup_tracking_data(self):
        """Periodically delete aged rows to prevent unbounded table growth.
        Retention: flight/vessel tracks 24h, events 48h (via expires_at), market_snapshots 7 days.
        Signals and Analyses event_id are nullified before event deletion to preserve their
        records (trading history / LLM analyses) while satisfying FK constraints.
        """
        from sqlalchemy import update
        while True:
            await asyncio.sleep(6 * 3600)  # Run every 6 hours
            try:
                from app.models.tracking import FlightTrack, VesselTrack
                from app.models.market import MarketSnapshot
                from app.models.signal import Signal
                from app.models.analysis import Analysis
                now = datetime.now(timezone.utc)
                track_cutoff = now - timedelta(hours=24)
                snapshot_cutoff = now - timedelta(days=7)
                async with async_session() as db:
                    res_f = await db.execute(
                        delete(FlightTrack).where(FlightTrack.captured_at < track_cutoff)
                    )
                    res_v = await db.execute(
                        delete(VesselTrack).where(VesselTrack.captured_at < track_cutoff)
                    )
                    expired_event_ids = select(Event.id).where(
                        Event.expires_at.isnot(None), Event.expires_at < now
                    )
                    await db.execute(
                        update(Signal)
                        .where(Signal.event_id.in_(expired_event_ids))
                        .values(event_id=None)
                    )
                    await db.execute(
                        update(Analysis)
                        .where(Analysis.event_id.in_(expired_event_ids))
                        .values(event_id=None)
                    )
                    res_e = await db.execute(
                        delete(Event).where(Event.expires_at.isnot(None), Event.expires_at < now)
                    )
                    res_s = await db.execute(
                        delete(MarketSnapshot).where(MarketSnapshot.captured_at < snapshot_cutoff)
                    )
                    await db.commit()
                    logger.info(
                        f"Cleanup: removed {res_f.rowcount} flight tracks, "
                        f"{res_v.rowcount} vessel tracks, "
                        f"{res_e.rowcount} expired events, "
                        f"{res_s.rowcount} old market snapshots"
                    )
            except Exception as e:
                logger.error(f"Cleanup failed: {e}")

    async def _run_source(self, source: BaseSource):
        """Run a single source on its interval."""
        while True:
            if source.enabled:
                events = await source.safe_fetch()
                # Cap events per cycle to prevent flood
                capped = events[:MAX_EVENTS_PER_CYCLE]
                if len(events) > MAX_EVENTS_PER_CYCLE:
                    logger.info(f"{source.name}: capped {len(events)} events to {MAX_EVENTS_PER_CYCLE}")
                for event in capped:
                    try:
                        await self._process_event(event)
                    except Exception as e:
                        logger.error(f"Failed to process event from {source.name}: {e}")
            await asyncio.sleep(source.interval + source._backoff)

    async def _process_event(self, raw: RawEvent):
        """Dedup, store, and push event to pipeline."""
        if not raw.text or not raw.text.strip():
            return

        text_hash = hashlib.sha256(raw.text.strip().lower().encode()).hexdigest()

        if await set_exists("event_hashes", text_hash):
            return

        # Store in database FIRST, then add to dedup set
        # (if commit fails, event can be retried on next cycle)
        async with async_session() as db:
            lat, lng = raw.latitude, raw.longitude

            if lat is None or lng is None:
                coords = geocode_event(raw.text, raw.country)
                if coords:
                    lat, lng = coords

            location = None
            if lat is not None and lng is not None:
                location = WKTElement(f"POINT({lng} {lat})", srid=4326)

            event = Event(
                source=raw.source,
                source_url=raw.url,
                raw_text=raw.text,
                text_hash=text_hash,
                location=location,
                country=raw.country or None,
                created_at=raw.timestamp,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
                image_url=raw.image_url or None,
                video_url=raw.video_url or None,
            )
            db.add(event)
            await db.commit()

        # Only mark as seen AFTER successful DB commit
        await set_add("event_hashes", text_hash, ttl=172800)

        # Run analysis pipeline with concurrency limit (max 3 simultaneous)
        async with _pipeline_semaphore:
            try:
                pipeline = _get_pipeline()
                await pipeline.process(event, raw.credibility)
            except Exception as e:
                logger.error(f"Pipeline failed for event {event.id}: {e}")

        # Emit to WebSocket
        try:
            await emit_event("events", "new_event", {
                "id": event.id,
                "source": event.source,
                "summary": event.summary or (event.raw_text[:200] if event.raw_text else ""),
                "category": event.category,
                "severity": event.severity,
                "country": event.country,
                "latitude": lat,
                "longitude": lng,
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "image_url": event.image_url,
                "video_url": event.video_url,
            })
        except Exception as e:
            logger.warning(f"WebSocket emit failed: {e}")

        # Push to Telegram bot (real-time alert for critical events)
        try:
            from app.telegram_bot.handlers.alerts import push_event_alert
            await push_event_alert(
                event_id=event.id,
                severity=event.severity,
                category=event.category,
                country=event.country,
                summary=event.summary or (event.raw_text[:200] if event.raw_text else None),
                source=event.source,
                image_url=event.image_url,
                source_url=event.source_url,
            )
        except Exception as e:
            logger.debug(f"Telegram push skipped: {e}")

    def get_status(self) -> list[dict]:
        return [s.status for s in self.sources]
