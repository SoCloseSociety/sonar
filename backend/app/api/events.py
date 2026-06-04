import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.event import Event

logger = logging.getLogger(__name__)

router = APIRouter()


def _normalize_entities(raw: dict | None) -> dict:
    """Ensure entities always has canonical keys and no 'assets_impact' typo."""
    if not raw or not isinstance(raw, dict):
        return {"people": [], "countries": [], "organizations": [], "assets_impacted": []}
    out = dict(raw)
    # Fix typo: assets_impact → assets_impacted
    if "assets_impact" in out and "assets_impacted" not in out:
        out["assets_impacted"] = out.pop("assets_impact")
    elif "assets_impact" in out:
        out.pop("assets_impact")
    # Ensure canonical keys exist
    for key in ("people", "countries", "organizations", "assets_impacted"):
        if key not in out:
            out[key] = []
    return out


def _extract_coords(location) -> tuple[float | None, float | None]:
    """Extract lat/lon from a GeoAlchemy2 geometry point."""
    if location is None:
        return None, None
    try:
        from geoalchemy2.shape import to_shape
        pt = to_shape(location)
        return pt.y, pt.x  # lat, lon
    except Exception:
        return None, None


@router.get("")
async def list_events(
    category: str | None = None,
    min_severity: int = Query(default=0),
    severity_min: int = Query(default=0),
    source: str | None = None,
    country: str | None = None,
    hours: int = Query(default=48, ge=1, le=168),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    # Accept both ?min_severity=N and ?severity_min=N
    effective_severity = max(min_severity, severity_min)

    # Use ST_Y/ST_X to extract coordinates in SQL (avoids WKB issues in Python)
    query = (
        select(
            Event,
            func.ST_Y(Event.location).label("_lat"),
            func.ST_X(Event.location).label("_lng"),
        )
        .order_by(desc(Event.created_at))
    )

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = query.where(Event.created_at >= cutoff)

    if category:
        query = query.where(Event.category == category)
    if effective_severity > 0:
        query = query.where(Event.severity >= effective_severity)
    if source:
        query = query.where(Event.source.ilike(f"%{source}%"))
    if country:
        query = query.where(Event.country == country)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    def _fmt(e: Event, lat: float | None, lon: float | None) -> dict:
        return {
            "id": e.id,
            "source": e.source,
            "source_url": e.source_url,
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
            "video_url": e.video_url,
            "media_urls": e.media_urls or [],
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }

    return [_fmt(row[0], row[1], row[2]) for row in rows]


@router.get("/stream")
async def event_stream(request: Request):
    """Server-Sent Events stream for real-time event updates.

    Manages its own DB sessions (short-lived per poll cycle) to avoid
    stale-connection errors that plague long-lived SSE generators.
    """
    from app.database import async_session

    async def generate():
        last_id = 0
        # Get the latest event ID as starting point
        try:
            async with async_session() as init_db:
                result = await init_db.execute(select(func.max(Event.id)))
                max_id = result.scalar()
                if max_id:
                    last_id = max_id
        except Exception as exc:
            logger.warning(f"SSE init error: {exc}")

        consecutive_errors = 0

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            try:
                # Open a fresh session for each poll cycle
                async with async_session() as db:
                    new_result = await db.execute(
                        select(
                            Event,
                            func.ST_Y(Event.location).label("_lat"),
                            func.ST_X(Event.location).label("_lng"),
                        )
                        .where(Event.id > last_id)
                        .order_by(Event.id)
                        .limit(20)
                    )
                    new_rows = new_result.all()

                    for row in new_rows:
                        e, lat, lon = row[0], row[1], row[2]
                        payload = {
                            "id": e.id,
                            "source": e.source,
                            "category": e.category,
                            "severity": e.severity,
                            "confidence": round(e.confidence, 4) if e.confidence else 0,
                            "country": e.country,
                            "summary": e.summary or (e.raw_text[:200] if e.raw_text else ""),
                            "keywords": e.keywords or [],
                            "entities": _normalize_entities(e.entities),
                            "latitude": lat,
                            "longitude": lon,
                            "image_url": e.image_url,
                            "video_url": e.video_url,
                            "media_urls": e.media_urls or [],
                            "created_at": e.created_at.isoformat() if e.created_at else None,
                        }
                        yield f"data: {json.dumps(payload, default=str)}\n\n"
                        last_id = e.id

                consecutive_errors = 0  # reset on success

                if not new_rows:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                    await asyncio.sleep(5)
                else:
                    await asyncio.sleep(2)

            except Exception as exc:
                consecutive_errors += 1
                logger.warning(f"SSE stream error ({consecutive_errors}): {exc}")
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                # Exponential backoff: 5s, 10s, 20s, max 30s
                backoff = min(5 * (2 ** (consecutive_errors - 1)), 30)
                await asyncio.sleep(backoff)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{event_id}")
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Event,
            func.ST_Y(Event.location).label("_lat"),
            func.ST_X(Event.location).label("_lng"),
        ).where(Event.id == event_id)
    )
    row = result.one_or_none()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Event not found")

    event, lat, lon = row[0], row[1], row[2]
    return {
        "id": event.id,
        "source": event.source,
        "source_url": event.source_url,
        "raw_text": event.raw_text,
        "category": event.category,
        "severity": event.severity,
        "confidence": round(event.confidence, 4) if event.confidence else 0,
        "impact_score": event.impact_score,
        "country": event.country,
        "summary": event.summary,
        "keywords": event.keywords or [],
        "entities": _normalize_entities(event.entities),
        "market_direction": event.market_direction,
        "latitude": lat,
        "longitude": lon,
        "image_url": event.image_url,
        "video_url": event.video_url,
        "media_urls": event.media_urls,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "processed_at": event.processed_at.isoformat() if event.processed_at else None,
    }
