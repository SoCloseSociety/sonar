from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.market import Market, MarketSnapshot

router = APIRouter()


@router.get("")
async def list_markets(
    active: bool = True,
    category: str | None = None,
    search: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    # Build base filter
    base_filter = select(Market)
    if active:
        base_filter = base_filter.where(Market.active == True)
    if category:
        base_filter = base_filter.where(Market.category == category)
    if search:
        base_filter = base_filter.where(Market.question.ilike(f"%{search}%"))

    # Get total count
    count_result = await db.execute(select(func.count()).select_from(base_filter.subquery()))
    total = count_result.scalar() or 0

    # Fetch paginated
    query = base_filter.order_by(desc(Market.updated_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    markets = result.scalars().all()

    if not markets:
        return {"markets": [], "total": total, "limit": limit, "offset": offset}

    # Fix N+1: fetch ALL latest snapshots in a single query using DISTINCT ON
    market_ids = [m.id for m in markets]
    snap_query = (
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id.in_(market_ids))
        .order_by(MarketSnapshot.market_id, desc(MarketSnapshot.captured_at))
        .distinct(MarketSnapshot.market_id)
    )
    snap_result = await db.execute(snap_query)
    snapshots_by_market = {s.market_id: s for s in snap_result.scalars().all()}

    market_data = []
    for m in markets:
        snapshot = snapshots_by_market.get(m.id)
        market_data.append({
            "id": m.id,
            "condition_id": m.condition_id,
            "question": m.question,
            "category": m.category,
            "outcomes": m.outcomes,
            "active": m.active,
            "tags": m.tags,
            "end_date": m.end_date.isoformat() if m.end_date else None,
            "price_yes": snapshot.price_yes if snapshot else None,
            "price_no": snapshot.price_no if snapshot else None,
            "volume_24h": snapshot.volume_24h if snapshot else None,
            "liquidity": snapshot.liquidity if snapshot else None,
            "spread": snapshot.spread if snapshot else None,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        })

    return {"markets": market_data, "total": total, "limit": limit, "offset": offset}


@router.get("/{market_id}")
async def get_market(market_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Market).where(Market.id == market_id))
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    # Fetch latest snapshot for price data
    snap_result = await db.execute(
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id == market_id)
        .order_by(desc(MarketSnapshot.captured_at))
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()

    return {
        "id": market.id,
        "condition_id": market.condition_id,
        "question": market.question,
        "description": market.description,
        "category": market.category,
        "outcomes": market.outcomes,
        "active": market.active,
        "tags": market.tags,
        "end_date": market.end_date.isoformat() if market.end_date else None,
        "price_yes": snapshot.price_yes if snapshot else None,
        "price_no": snapshot.price_no if snapshot else None,
        "volume_24h": snapshot.volume_24h if snapshot else None,
        "liquidity": snapshot.liquidity if snapshot else None,
        "spread": snapshot.spread if snapshot else None,
    }


@router.get("/{market_id}/snapshots")
async def get_market_snapshots(
    market_id: int,
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id == market_id)
        .order_by(desc(MarketSnapshot.captured_at))
        .limit(limit)
    )
    snapshots = result.scalars().all()

    return [
        {
            "price_yes": s.price_yes,
            "price_no": s.price_no,
            "volume_24h": s.volume_24h,
            "liquidity": s.liquidity,
            "spread": s.spread,
            "captured_at": s.captured_at.isoformat(),
        }
        for s in snapshots
    ]
