import logging
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.signal import Signal
from app.models.event import Event
from app.models.market import Market
from app.auth.dependencies import get_admin_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


VALID_SIGNAL_STATUSES = {"active", "filled", "closed", "expired"}


@router.get("")
async def list_signals(
    status: str = "active",
    min_confidence: float = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    if status not in VALID_SIGNAL_STATUSES:
        status = "active"

    # JOIN markets and events to enrich signals with readable context
    query = (
        select(
            Signal,
            Market.question.label("market_question"),
            Market.condition_id.label("condition_id"),
            Market.category.label("market_category"),
            Event.summary.label("event_summary"),
        )
        .outerjoin(Market, Signal.market_id == Market.id)
        .outerjoin(Event, Signal.event_id == Event.id)
        .where(Signal.status == status)
        .order_by(desc(Signal.created_at))
    )

    if min_confidence > 0:
        query = query.where(Signal.confidence >= min_confidence)

    query = query.limit(limit)
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": s.id,
            "event_id": s.event_id,
            "market_id": s.market_id,
            "signal_type": s.signal_type,
            "current_price": s.current_price,
            "estimated_fair_value": s.estimated_fair_value,
            "edge_pct": s.edge_pct,
            "confidence": round(s.confidence, 4) if s.confidence else 0,
            "direction": s.direction,
            "time_sensitivity": s.time_sensitivity,
            "reasoning": s.reasoning,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            # Enriched fields — these answer "what are we betting on?"
            "market_question": market_question,
            "market_condition_id": condition_id,
            "market_category": market_category,
            "event_summary": event_summary,
        }
        for s, market_question, condition_id, market_category, event_summary in rows
    ]


@router.post("/regenerate")
async def regenerate_signals(
    background_tasks: BackgroundTasks,
    min_severity: int = Query(default=7, ge=5, le=10),
    limit: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Re-run rule-based signal generation on recent high-severity events.
    Useful to bootstrap signals after a fresh deploy or config change.
    """
    result = await db.execute(
        select(Event.id)
        .where(Event.severity >= min_severity)
        .order_by(desc(Event.created_at))
        .limit(limit)
    )
    event_ids = [row[0] for row in result.all()]

    async def _run():
        import asyncio
        from app.analyzer.rule_based_signals import RuleBasedSignalGenerator
        from app.database import async_session
        generator = RuleBasedSignalGenerator(min_severity=min_severity)
        generated = 0
        async with async_session() as session:
            for eid in event_ids:
                try:
                    ev_result = await session.execute(select(Event).where(Event.id == eid))
                    ev = ev_result.scalar_one_or_none()
                    if not ev:
                        continue
                    sigs = await generator.generate(session, ev)
                    if sigs:
                        await session.commit()
                        generated += len(sigs)
                    await asyncio.sleep(0)  # yield to event loop
                except Exception as e:
                    logger.warning(f"Regen signal failed for event {eid}: {e}")
        logger.info(f"Signal regeneration: {generated} signals from {len(event_ids)} events")

    background_tasks.add_task(_run)
    return {"status": "running", "events_queued": len(event_ids)}
