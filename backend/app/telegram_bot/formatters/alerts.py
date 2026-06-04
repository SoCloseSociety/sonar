from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.tension import TensionHistory
from app.models.signal import Signal


async def format_tension(db: AsyncSession) -> str:
    result = await db.execute(
        select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(1)
    )
    tension = result.scalar_one_or_none()

    if not tension:
        return "🌡️ Global Tension Index: No data yet"

    bars = int(tension.score)
    empty = 10 - bars
    bar_str = "█" * bars + "░" * empty

    level_icons = {
        "CALM": "🟢", "GUARDED": "🟡", "ELEVATED": "🟠",
        "HIGH": "🔴", "CRITICAL": "⚫",
    }
    icon = level_icons.get(tension.level, "⚪")

    text = "🌡️ <b>Global Tension Index</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    text += f"  [{bar_str}] <b>{tension.score:.1f}/10</b>\n"
    text += f"  Level: <b>{tension.level}</b> {icon}\n\n"

    if tension.breakdown:
        text += "<b>Factor Breakdown:</b>\n"
        sorted_factors = sorted(
            tension.breakdown.items(), key=lambda x: x[1], reverse=True
        )
        for factor, value in sorted_factors:
            # Mini bar for each factor
            mini_bars = int(value * 2)  # scale 0-5 → 0-10
            mini_str = "▓" * min(mini_bars, 10) + "░" * max(0, 10 - mini_bars)
            text += f"  [{mini_str}] {factor}: <b>{value:.2f}</b>\n"

    # Recent trend (last 3 readings)
    result2 = await db.execute(
        select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(4)
    )
    readings = result2.scalars().all()

    if len(readings) >= 2:
        scores = [r.score for r in readings]
        trend = scores[0] - scores[-1]
        trend_icon = "📈" if trend > 0.3 else "📉" if trend < -0.3 else "➡️"
        text += f"\n{trend_icon} Trend: <b>{trend:+.1f}</b> over last {len(readings)} readings\n"

    return text


async def format_signals(db: AsyncSession) -> str:
    result = await db.execute(
        select(Signal).where(Signal.status == "active").order_by(desc(Signal.created_at)).limit(8)
    )
    signals = result.scalars().all()

    if not signals:
        return "⚡ No active signals right now."

    text = "⚡ <b>Active Trading Signals</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for s in signals:
        direction = str(s.direction or "?")
        dir_icon = "📈" if "YES" in direction.upper() else "📉"

        # Confidence bar
        conf_bars = int((s.confidence or 0) * 10)
        conf_str = "●" * conf_bars + "○" * (10 - conf_bars)

        text += f"{dir_icon} <b>{s.signal_type}</b>\n"
        text += f"  🎯 {direction} | Edge: <b>{s.edge_pct:.1f}%</b>\n"
        text += f"  [{conf_str}] {s.confidence:.0%} confidence\n"
        if s.reasoning:
            text += f"  💡 <i>{s.reasoning[:120]}</i>\n"
        text += "\n"

    return text


def format_alert_message(signal_type: str, data: dict) -> str:
    """Format an alert message for admin notification."""
    if signal_type == "signal":
        direction = str(data.get("direction", "?"))
        dir_icon = "📈" if "YES" in direction.upper() else "📉"
        return (
            f"⚡ <b>SIGNAL ALERT</b> {dir_icon}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📊 Direction: <b>{direction}</b>\n"
            f"💰 Edge: <b>{data.get('edge_pct', 0):.1f}%</b>\n"
            f"📈 Confidence: <b>{data.get('confidence', 0):.0%}</b>\n\n"
            f"💡 {data.get('reasoning', '')[:300]}"
        )
    elif signal_type == "critical_event":
        severity = data.get("severity", "?")
        sev_icon = "🔴" if str(severity).isdigit() and int(severity) >= 9 else "🟠"
        return (
            f"🚨 <b>CRITICAL EVENT</b> {sev_icon}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📝 {data.get('summary', 'Unknown event')}\n"
            f"⚠️ Severity: <b>{severity}/10</b>\n"
            f"📡 Source: {data.get('source', '?')}"
        )
    return str(data)
