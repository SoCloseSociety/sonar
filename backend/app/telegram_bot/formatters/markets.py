from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.market import Market, MarketSnapshot


async def format_market_list(db: AsyncSession) -> str:
    result = await db.execute(
        select(Market).where(Market.active == True).order_by(desc(Market.updated_at)).limit(10)
    )
    markets = result.scalars().all()

    if not markets:
        return "💹 No active markets found."

    text = "💹 <b>Top Polymarket Markets</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for i, m in enumerate(markets, 1):
        snap_result = await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id == m.id)
            .order_by(desc(MarketSnapshot.captured_at))
            .limit(1)
        )
        snap = snap_result.scalar_one_or_none()

        price = f"{snap.price_yes:.0%}" if snap and snap.price_yes else "?"
        vol = f"${snap.volume_24h:,.0f}" if snap and snap.volume_24h else "?"

        question = m.question[:55] + "…" if len(m.question) > 55 else m.question

        # Price-based icon
        if snap and snap.price_yes:
            if snap.price_yes >= 0.8:
                icon = "🟢"
            elif snap.price_yes >= 0.5:
                icon = "🟡"
            elif snap.price_yes >= 0.2:
                icon = "🟠"
            else:
                icon = "🔴"
        else:
            icon = "⚪"

        text += f"{i}. {icon} <b>{price}</b> | {question}\n"
        text += f"     📊 Vol: {vol}\n\n"

    return text


async def format_top_movers(db: AsyncSession) -> str:
    result = await db.execute(
        select(Market).where(Market.active == True).limit(50)
    )
    markets = result.scalars().all()

    movers = []
    for m in markets:
        snaps_result = await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id == m.id)
            .order_by(desc(MarketSnapshot.captured_at))
            .limit(2)
        )
        snaps = snaps_result.scalars().all()
        if len(snaps) >= 2 and snaps[0].price_yes and snaps[1].price_yes:
            delta = snaps[0].price_yes - snaps[1].price_yes
            if abs(delta) > 0.01:
                movers.append({
                    "id": m.id,
                    "question": m.question,
                    "price": snaps[0].price_yes,
                    "delta": delta,
                })

    movers.sort(key=lambda x: abs(x["delta"]), reverse=True)

    if not movers:
        return "🔥 No significant market movers right now."

    text = "🔥 <b>Top Market Movers</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for i, m in enumerate(movers[:10], 1):
        arrow = "📈" if m["delta"] > 0 else "📉"
        delta_str = f"{m['delta']:+.1%}"
        price_str = f"{m['price']:.0%}"
        question = m["question"][:45] + "…" if len(m["question"]) > 45 else m["question"]

        text += f"{i}. {arrow} <b>{delta_str}</b> → {price_str}\n"
        text += f"     {question}\n\n"

    return text
