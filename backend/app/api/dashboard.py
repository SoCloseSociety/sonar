import json
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, desc, case, literal_column
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.event import Event
from app.models.market import Market
from app.models.signal import Signal
from app.models.tracking import FlightTrack, VesselTrack
from app.models.tension import TensionHistory
from app.redis_client import cache_get, cache_set
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Cache for 30 seconds — avoids repeated COUNT queries
    cached = await cache_get("dashboard:stats")
    if cached:
        return json.loads(cached)

    now = datetime.now(timezone.utc)
    one_hour = now - timedelta(hours=1)
    twenty_four = now - timedelta(hours=24)

    # Single query with subqueries — 6x faster than sequential queries
    combined = await db.execute(
        select(
            select(func.count(Event.id)).where(Event.created_at > one_hour).correlate(None).scalar_subquery().label("events_1h"),
            select(func.count(Event.id)).where(Event.created_at > twenty_four).correlate(None).scalar_subquery().label("events_24h"),
            select(func.count(Market.id)).where(Market.active == True).correlate(None).scalar_subquery().label("markets"),
            select(func.count(Signal.id)).where(Signal.status == "active").correlate(None).scalar_subquery().label("signals"),
            select(func.count(FlightTrack.id)).where(FlightTrack.captured_at > one_hour).correlate(None).scalar_subquery().label("flights"),
            select(func.count(VesselTrack.id)).where(VesselTrack.captured_at > one_hour).correlate(None).scalar_subquery().label("vessels"),
        )
    )
    row = combined.one()

    result = {
        "events_per_hour": row.events_1h or 0,
        "events_24h": row.events_24h or 0,
        "markets": row.markets or 0,
        "active_signals": row.signals or 0,
        "flights": row.flights or 0,
        "vessels": row.vessels or 0,
    }

    await cache_set("dashboard:stats", json.dumps(result), ttl=30)
    return result


@router.get("/tension")
async def get_tension(db: AsyncSession = Depends(get_db)):
    # Cache for 30 seconds
    cached = await cache_get("dashboard:tension")
    if cached:
        return json.loads(cached)

    # Single query to fetch both current and previous tension
    result = await db.execute(
        select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(2)
    )
    rows = result.scalars().all()

    if not rows:
        return {"score": 0, "level": "CALM", "trend": "stable", "breakdown": {}}

    tension = rows[0]
    prev = rows[1] if len(rows) > 1 else None

    trend = "stable"
    if prev:
        diff = tension.score - prev.score
        if diff > 0.3:
            trend = "rising"
        elif diff < -0.3:
            trend = "falling"

    data = {
        "score": tension.score,
        "level": tension.level,
        "trend": trend,
        "breakdown": tension.breakdown,
        "calculated_at": tension.calculated_at.isoformat(),
    }

    await cache_set("dashboard:tension", json.dumps(data, default=str), ttl=30)
    return data


@router.get("/sources")
async def get_sources_status(request: Request):
    """Return health/status for all ingestion sources."""
    mgr = getattr(request.app.state, "ingestion_manager", None)
    if mgr:
        return mgr.get_status()
    return []


@router.get("/tension/history")
async def get_tension_history(hours: int = 24, db: AsyncSession = Depends(get_db)):
    # Cache key includes current hour bucket so it refreshes at hour boundaries
    hour_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    cache_key = f"dashboard:tension_history:{hours}:{hour_bucket}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(TensionHistory)
        .where(TensionHistory.calculated_at > since)
        .order_by(TensionHistory.calculated_at)
    )
    data = [
        {
            "score": t.score,
            "level": t.level,
            "calculated_at": t.calculated_at.isoformat(),
        }
        for t in result.scalars().all()
    ]

    await cache_set(cache_key, json.dumps(data), ttl=60)
    return data
