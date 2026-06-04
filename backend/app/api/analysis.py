"""
/api/analysis -- Multi-agent consensus analysis endpoints.
Triggers and retrieves AI-powered multi-perspective intelligence analyses.
"""
import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import Analysis
from app.analyzer.consensus_engine import ConsensusEngine, AGENT_ARCHETYPES
from app.redis_client import cache_get, cache_set

router = APIRouter()
engine = ConsensusEngine()


def _fmt_analysis(a: Analysis) -> dict:
    return {
        "id": a.id,
        "event_id": a.event_id,
        "market_id": a.market_id,
        "analysis_type": a.analysis_type,
        "title": a.title,
        "summary": a.summary,
        "agent_assessments": a.agent_assessments,
        "consensus_severity": a.consensus_severity,
        "consensus_confidence": a.consensus_confidence,
        "consensus_direction": a.consensus_direction,
        "prediction": a.prediction,
        "prediction_probability": a.prediction_probability,
        "prediction_timeframe": a.prediction_timeframe,
        "market_price_at_analysis": a.market_price_at_analysis,
        "predicted_fair_value": a.predicted_fair_value,
        "actual_outcome": a.actual_outcome,
        "accuracy_score": a.accuracy_score,
        "agent_count": a.agent_count,
        "model_used": a.model_used,
        "processing_time_ms": a.processing_time_ms,
        "categories": a.categories,
        "entities_mentioned": a.entities_mentioned,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }


@router.get("")
async def list_analyses(
    analysis_type: str | None = None,
    limit: int = Query(default=20, le=50),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List recent analyses."""
    query = select(Analysis).order_by(desc(Analysis.created_at))
    if analysis_type:
        query = query.where(Analysis.analysis_type == analysis_type)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    analyses = result.scalars().all()
    return [_fmt_analysis(a) for a in analyses]


@router.get("/agents")
async def list_agents():
    """Return the list of analyst archetypes used by the consensus engine."""
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "icon": a["icon"],
            "focus": a["focus"],
            "bias": a["bias"],
            "primary_categories": a["categories"],
        }
        for a in AGENT_ARCHETYPES
    ]


@router.get("/stats")
async def analysis_stats(db: AsyncSession = Depends(get_db)):
    """Return analysis statistics."""
    cached = await cache_get("api:analysis_stats")
    if cached:
        return json.loads(cached)

    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)

    total_r = await db.execute(select(func.count(Analysis.id)))
    total = total_r.scalar() or 0

    recent_r = await db.execute(
        select(func.count(Analysis.id)).where(Analysis.created_at > since_24h)
    )
    recent_24h = recent_r.scalar() or 0

    # Average confidence
    avg_conf_r = await db.execute(
        select(func.avg(Analysis.consensus_confidence))
        .where(Analysis.created_at > since_7d)
    )
    avg_confidence = round(float(avg_conf_r.scalar() or 0.5), 3)

    # Direction distribution
    dir_r = await db.execute(
        select(Analysis.consensus_direction, func.count(Analysis.id))
        .where(Analysis.created_at > since_7d)
        .group_by(Analysis.consensus_direction)
    )
    direction_dist = {row[0] or "unknown": row[1] for row in dir_r.all()}

    # Accuracy (for resolved analyses)
    acc_r = await db.execute(
        select(func.avg(Analysis.accuracy_score))
        .where(Analysis.accuracy_score.isnot(None))
    )
    avg_accuracy = round(float(acc_r.scalar() or 0), 3) or None

    payload = {
        "total_analyses": total,
        "analyses_24h": recent_24h,
        "avg_confidence_7d": avg_confidence,
        "direction_distribution": direction_dist,
        "avg_accuracy": avg_accuracy,
        "agent_count": len(AGENT_ARCHETYPES),
    }

    await cache_set("api:analysis_stats", json.dumps(payload), ttl=60)
    return payload


@router.post("/event/{event_id}")
async def analyze_event(event_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Trigger multi-agent analysis for a specific event. Runs in background."""
    existing = await db.execute(
        select(Analysis.id).where(Analysis.event_id == event_id).limit(1)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Analysis already exists for this event")

    background_tasks.add_task(_run_event_analysis, event_id)
    return {"status": "queued", "event_id": event_id, "message": "Analysis started in background"}


@router.post("/situation")
async def analyze_situation(
    background_tasks: BackgroundTasks,
    topic: str = Query(..., min_length=2, max_length=200),
    hours: int = Query(default=48, ge=1, le=168),
):
    """Trigger broad situational analysis on a topic."""
    background_tasks.add_task(_run_situation_analysis, topic, hours)
    return {"status": "queued", "topic": topic, "hours": hours, "message": "Situation analysis started"}


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single analysis by ID."""
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _fmt_analysis(analysis)


async def _run_event_analysis(event_id: int):
    """Background task: run event analysis."""
    try:
        await engine.analyze_event(event_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Event analysis failed for {event_id}: {e}")


async def _run_situation_analysis(topic: str, hours: int):
    """Background task: run situation analysis."""
    try:
        await engine.analyze_situation(topic, hours)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Situation analysis failed for '{topic}': {e}")
