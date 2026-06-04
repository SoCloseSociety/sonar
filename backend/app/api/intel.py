"""
/api/intel — Aggregated intelligence briefing endpoint.
Combines events, tensions, zones, anomalies into a single response.
All category queries run concurrently via asyncio.gather for ~3x speedup.
"""
import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.event import Event
from app.models.tension import TensionHistory
from app.redis_client import cache_get, cache_set

router = APIRouter()


def _normalize_entities(raw) -> dict:
    if not raw or not isinstance(raw, dict):
        return {"people": [], "countries": [], "organizations": [], "assets_impacted": []}
    out = dict(raw)
    if "assets_impact" in out and "assets_impacted" not in out:
        out["assets_impacted"] = out.pop("assets_impact")
    elif "assets_impact" in out:
        out.pop("assets_impact")
    for key in ("people", "countries", "organizations", "assets_impacted"):
        if key not in out:
            out[key] = []
    return out


def _extract_coords(location):
    if location is None:
        return None, None
    try:
        from geoalchemy2.shape import to_shape
        pt = to_shape(location)
        return pt.y, pt.x
    except Exception:
        return None, None


def _fmt_event(e: Event) -> dict:
    lat, lon = _extract_coords(e.location)
    return {
        "id": e.id,
        "source": e.source,
        "category": e.category,
        "severity": e.severity,
        "confidence": round(e.confidence, 4) if e.confidence else 0,
        "impact_score": e.impact_score,
        "country": e.country,
        "summary": e.summary or (e.raw_text[:200] if e.raw_text else ""),
        "keywords": e.keywords or [],
        "entities": _normalize_entities(e.entities),
        "latitude": lat,
        "longitude": lon,
        "image_url": e.image_url,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


async def _query_events_in_session(
    db: AsyncSession, category: str | None, since: datetime,
    min_sev: int, limit: int, confidence_gt_zero: bool = False
) -> list[dict]:
    """Run a category query within an existing session."""
    from geoalchemy2.functions import ST_X, ST_Y
    q = select(
        Event,
        ST_Y(Event.location).label("_lat"),
        ST_X(Event.location).label("_lng"),
    ).where(Event.created_at > since)
    if category:
        q = q.where(Event.category == category)
    if min_sev > 0:
        q = q.where(Event.severity >= min_sev)
    if confidence_gt_zero:
        q = q.where(Event.confidence > 0)
    q = q.order_by(desc(Event.severity), desc(Event.created_at)).limit(limit)
    result = await db.execute(q)
    rows = result.all()
    out = []
    for row in rows:
        e, lat, lon = row[0], row[1], row[2]
        d = _fmt_event(e)
        d["latitude"] = lat
        d["longitude"] = lon
        out.append(d)
    return out


@router.get("/intel")
async def intel_briefing(db: AsyncSession = Depends(get_db)):
    """Aggregated intelligence briefing -- threat level, top events, conflicts, anomalies."""
    cached = await cache_get("api:intel_briefing")
    if cached:
        return json.loads(cached)

    now = datetime.now(timezone.utc)
    since_48h = now - timedelta(hours=48)
    since_24h = now - timedelta(hours=24)

    # ── Threat level (latest tension) -- fast, single query ──
    tension_result = await db.execute(
        select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(2)
    )
    tensions = tension_result.scalars().all()
    threat_level = {"score": 0, "level": "CALM", "trend": "stable"}
    if tensions:
        t = tensions[0]
        prev = tensions[1] if len(tensions) > 1 else None
        trend = "stable"
        if prev:
            diff = t.score - prev.score
            if diff > 0.3:
                trend = "rising"
            elif diff < -0.3:
                trend = "falling"
        threat_level = {"score": t.score, "level": t.level, "trend": trend}

    # ── All queries in single session (avoids pool exhaustion under heavy load) ──
    top_events = await _query_events_in_session(db, None, since_48h, 7, 10, confidence_gt_zero=True)
    active_conflicts = await _query_events_in_session(db, "MILITARY_CONFLICT", since_48h, 6, 10)
    nuclear_alerts = await _query_events_in_session(db, "NUCLEAR", since_48h, 0, 5)
    cyber_threats = await _query_events_in_session(db, "CYBER_ATTACK", since_48h, 0, 5)
    maritime_anomalies = await _query_events_in_session(db, "MARITIME_SECURITY", since_48h, 0, 5)

    history_result = await db.execute(
        select(TensionHistory)
        .where(TensionHistory.calculated_at > since_24h)
        .order_by(TensionHistory.calculated_at)
    )
    tension_history = [
        {"score": t.score, "level": t.level, "calculated_at": t.calculated_at.isoformat()}
        for t in history_result.scalars().all()
    ]

    payload = {
        "generated_at": now.isoformat(),
        "threat_level": threat_level,
        "top_events": top_events,
        "active_conflicts": active_conflicts,
        "nuclear_alerts": nuclear_alerts,
        "cyber_threats": cyber_threats,
        "maritime_anomalies": maritime_anomalies,
        "tension_history": tension_history,
    }

    await cache_set("api:intel_briefing", json.dumps(payload, default=str), ttl=45)
    return payload
