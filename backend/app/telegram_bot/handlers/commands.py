import logging
from datetime import datetime, timezone, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from app.database import async_session
from app.telegram_bot.bot import admin_only, is_admin
from app.telegram_bot.formatters.markets import format_market_list, format_top_movers
from app.telegram_bot.formatters.alerts import format_tension, format_signals

logger = logging.getLogger(__name__)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    chat_id = user.id

    text = (
        "🛰️ <b>SONAR Intelligence Terminal</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "Real-time geopolitical intelligence, flight/vessel tracking, "
        "and Polymarket signal detection.\n\n"
    )

    if is_admin(update):
        text += "✅ <b>Admin access confirmed</b>\n\n"
        text += (
            "📊 <b>Intelligence</b>\n"
            "  /status   — System health\n"
            "  /events   — Events summary\n"
            "  /critical — Critical events\n"
            "  /top      — Top events by severity\n"
            "  /search   — Search events\n"
            "  /tension  — Tension index\n"
            "  /digest   — Daily briefing\n"
            "  /stats    — Event rate stats\n\n"
            "💹 <b>Markets</b>\n"
            "  /markets  — Top markets\n"
            "  /market   — Market detail\n"
            "  /hot      — Price movers\n"
            "  /signals  — Trading signals\n\n"
            "🔍 <b>Tracking</b>\n"
            "  /flights  — Military flights\n"
            "  /vessels  — Naval movements\n"
            "  /watch    — Watch keyword/market\n"
            "  /watchlist — View watchlist\n\n"
            "🔧 <b>Admin</b>\n"
            "  /sources  — Data source status\n"
            "  /toggle   — Enable/disable source\n"
            "  /scan     — Force scan\n"
            "  /restart  — Restart sources\n"
            "  /db       — Database stats\n"
            "  /purge    — Clean old data\n"
            "  /config   — Configuration\n"
            "  /alerts   — Auto-alerts on/off\n"
            "  /logs     — Error logs\n"
            "  /uptime   — System uptime\n"
        )
    else:
        text += (
            f"🆔 Your Chat ID: <code>{chat_id}</code>\n\n"
            "⛔ <i>Admin access required. Set your Chat ID in "
            "TELEGRAM_ADMIN_CHAT_ID to activate.</i>"
        )

    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.ingestion.manager import IngestionManager
    from sqlalchemy import func, select
    from app.models.event import Event
    from app.models.market import Market
    from app.models.signal import Signal

    manager = IngestionManager()
    sources = manager.get_status()
    online = sum(1 for s in sources if s["healthy"] and s["enabled"])
    errored = sum(1 for s in sources if s["error_count"] > 0)
    total_enabled = sum(1 for s in sources if s["enabled"])

    async with async_session() as db:
        since_24h = datetime.now(timezone.utc) - timedelta(hours=24)

        events_24h = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > since_24h)
        )).scalar()
        events_total = (await db.execute(select(func.count(Event.id)))).scalar()
        markets = (await db.execute(
            select(func.count(Market.id)).where(Market.active == True)
        )).scalar()
        signals_active = (await db.execute(
            select(func.count(Signal.id)).where(Signal.status == "active")
        )).scalar()

    # Redis check
    redis_status = "🔴"
    try:
        from app.redis_client import get_redis
        r = await get_redis()
        await r.ping()
        redis_status = "🟢"
    except Exception:
        pass

    # Tension
    tension_str = "N/A"
    try:
        from app.models.tension import TensionHistory
        from sqlalchemy import desc
        async with async_session() as db:
            t = (await db.execute(
                select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(1)
            )).scalar_one_or_none()
            if t:
                tension_str = f"{t.score:.1f}/10 ({t.level})"
    except Exception:
        pass

    from app.telegram_bot.handlers.admin import are_alerts_enabled
    alerts_icon = "🔔" if are_alerts_enabled() else "🔕"

    text = (
        "📊 <b>SONAR System Status</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📡 Sources: <b>{online}/{total_enabled}</b> online"
    )
    if errored:
        text += f" ({errored} ⚠️)"
    text += "\n"
    text += (
        f"📰 Events (24h): <b>{events_24h:,}</b>\n"
        f"📰 Events (total): <b>{events_total:,}</b>\n"
        f"💹 Active Markets: <b>{markets:,}</b>\n"
        f"⚡ Active Signals: <b>{signals_active}</b>\n"
        f"🌡️ Tension: <b>{tension_str}</b>\n"
        f"{redis_status} Redis | {alerts_icon} Alerts\n"
    )

    keyboard = [
        [
            InlineKeyboardButton("📡 Sources", callback_data="nav_sources"),
            InlineKeyboardButton("📰 Events", callback_data="nav_events"),
        ],
        [
            InlineKeyboardButton("🚨 Critical", callback_data="nav_critical"),
            InlineKeyboardButton("⚡ Signals", callback_data="nav_signals"),
        ],
    ]

    await update.message.reply_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def cmd_markets(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return
    async with async_session() as db:
        text = await format_market_list(db)
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_hot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return
    async with async_session() as db:
        text = await format_top_movers(db)
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_signals(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return
    async with async_session() as db:
        text = await format_signals(db)
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_tension(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return
    async with async_session() as db:
        text = await format_tension(db)
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_flights(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from sqlalchemy import select, desc, func
    from app.models.tracking import FlightTrack

    async with async_session() as db:
        since = datetime.now(timezone.utc) - timedelta(minutes=30)

        # Count total military flights
        total = (await db.execute(
            select(func.count(FlightTrack.id))
            .where(FlightTrack.is_military == True)
            .where(FlightTrack.captured_at > since)
        )).scalar()

        result = await db.execute(
            select(FlightTrack)
            .where(FlightTrack.is_military == True)
            .where(FlightTrack.captured_at > since)
            .order_by(desc(FlightTrack.captured_at))
            .limit(20)
        )
        flights = result.scalars().all()

    if not flights:
        await update.message.reply_text("✅ No notable military flights right now.")
        return

    text = f"✈️ <b>Military Flights</b> (last 30min)\n"
    text += f"━━━━━━━━━━━━━━━━━━━━━━━\n"
    text += f"📊 Total tracks: <b>{total}</b>\n\n"

    seen = set()
    for f in flights:
        if f.callsign in seen:
            continue
        seen.add(f.callsign)
        cs = f.callsign or f.icao24 or "?"
        country = f.origin_country or "?"
        alt = f"{f.altitude:,.0f}m" if f.altitude else "?"
        speed = f"{f.velocity:.0f}kt" if f.velocity else "?"

        text += f"  🛩️ <code>{cs:10s}</code> | {country} | ↕{alt} | →{speed}\n"

    if len(seen) >= 15:
        text += f"\n<i>... and more ({total} total tracks)</i>"

    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_vessels(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from sqlalchemy import select, desc, func
    from app.models.tracking import VesselTrack

    async with async_session() as db:
        since = datetime.now(timezone.utc) - timedelta(hours=1)

        total = (await db.execute(
            select(func.count(VesselTrack.id))
            .where(VesselTrack.is_military == True)
            .where(VesselTrack.captured_at > since)
        )).scalar()

        result = await db.execute(
            select(VesselTrack)
            .where(VesselTrack.is_military == True)
            .where(VesselTrack.captured_at > since)
            .order_by(desc(VesselTrack.captured_at))
            .limit(20)
        )
        vessels = result.scalars().all()

    if not vessels:
        await update.message.reply_text("✅ No notable naval movements right now.")
        return

    text = f"🚢 <b>Naval Movements</b> (last 1h)\n"
    text += f"━━━━━━━━━━━━━━━━━━━━━━━\n"
    text += f"📊 Total tracks: <b>{total}</b>\n\n"

    seen = set()
    for v in vessels:
        if v.mmsi in seen:
            continue
        seen.add(v.mmsi)
        name = v.vessel_name or str(v.mmsi)
        flag = v.flag or "?"
        speed = f"{v.speed:.1f}kn" if v.speed else "?"

        text += f"  ⚓ <code>{name:15s}</code> | {flag} | →{speed}\n"

    if len(seen) >= 15:
        text += f"\n<i>... and more ({total} total tracks)</i>"

    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    text = (
        "❓ <b>SONAR Bot — Command Reference</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "📊 <b>Intelligence</b>\n"
        "  /status         — Full system health overview\n"
        "  /events [hours] — Events summary by category\n"
        "  /critical [hrs] — Critical events (severity ≥ 8)\n"
        "  /top [N]        — Top N events by severity\n"
        "  /search &lt;query&gt; — Full-text event search\n"
        "  /tension        — Global tension index\n"
        "  /stats          — Event rate &amp; source stats\n"
        "  /digest [on|off]— Daily intel briefing\n\n"
        "💹 <b>Markets &amp; Signals</b>\n"
        "  /markets         — Top 10 Polymarket markets\n"
        "  /market &lt;id|q&gt;  — Market detail + sparkline\n"
        "  /hot             — Biggest price movers\n"
        "  /signals         — Active trading signals\n\n"
        "🔍 <b>Tracking &amp; Monitoring</b>\n"
        "  /flights         — Military flights (last 30min)\n"
        "  /vessels         — Naval movements (last 1h)\n"
        "  /watch &lt;kw&gt;     — Watch keyword or market\n"
        "  /unwatch &lt;kw&gt;   — Remove watch\n"
        "  /watchlist       — View all watches\n\n"
        "🔧 <b>Admin</b>\n"
        "  /sources         — Data source detailed status\n"
        "  /toggle &lt;name&gt;  — Enable/disable a source\n"
        "  /scan &lt;name&gt;    — Force immediate scan\n"
        "  /restart [name]  — Reset source errors\n"
        "  /db              — Database statistics\n"
        "  /purge &lt;tbl&gt; &lt;h&gt;— Clean old data\n"
        "  /config          — View configuration\n"
        "  /alerts [on|off] — Toggle auto-alerts\n"
        "  /logs [source]   — View error logs\n"
        "  /uptime          — System uptime &amp; memory\n"
        "  /broadcast &lt;msg&gt; — WebSocket broadcast\n\n"
        "🔔 <b>Auto-Alerts:</b>\n"
        "  • Critical events (sev ≥ 8) with images\n"
        "  • High-confidence signals\n"
        "  • Tension level changes\n"
        "  • Source failures &amp; recoveries\n"
        "  • Watchlist keyword matches\n"
        "  • Market price moves (3%+)\n"
        "  • Daily digest at 08:00 UTC\n\n"
        "💡 <i>All 30 commands are admin-only.</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML")
