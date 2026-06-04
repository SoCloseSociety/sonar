import logging
from datetime import datetime, timezone, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from app.telegram_bot.bot import is_admin

logger = logging.getLogger(__name__)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not is_admin(update):
        await query.answer("⛔ Unauthorized", show_alert=True)
        return

    data = query.data

    # ── Navigation ──
    if data == "nav_sources":
        await _show_sources_inline(query)
    elif data == "nav_events":
        await _show_events_inline(query)
    elif data == "nav_critical":
        await _show_critical_inline(query)
    elif data == "nav_signals":
        await _show_signals_inline(query)

    # ── Source management ──
    elif data.startswith("toggle_"):
        source_name = data[7:]
        await _toggle_source(query, source_name)
    elif data == "restart_all_errored":
        await _restart_all_errored(query)

    # ── Market/event detail ──
    elif data.startswith("market_"):
        market_id = data[7:]
        await _show_market_detail(query, market_id)
    elif data.startswith("event_"):
        event_id = data[6:]
        await _show_event_detail(query, event_id)

    # ── Pagination ──
    elif data.startswith("critical_"):
        # critical_{hours}_{offset}
        parts = data.split("_")
        if len(parts) == 3:
            await _paginate_critical(query, int(parts[1]), int(parts[2]))

    elif data.startswith("search_"):
        # search_{query}_{offset}
        parts = data.split("_", 2)
        if len(parts) == 3:
            await _paginate_search(query, parts[1], int(parts[2]))

    elif data.startswith("top_"):
        # top_{offset}
        await _paginate_top(query, int(data[4:]))

    # ── Refresh ──
    elif data == "refresh_status":
        await query.edit_message_text("🔄 Use /status to get fresh data.", parse_mode="HTML")

    else:
        await query.edit_message_text("❓ Unknown action.")


# ═══════════════════════════════════════════════════════════════════
# NAVIGATION
# ═══════════════════════════════════════════════════════════════════

async def _show_sources_inline(query):
    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()
    sources = manager.get_status()

    status_icons = {"active": "🟢", "idle": "🟡", "error": "🔴", "disabled": "⚫"}

    text = "📡 <b>Data Sources</b>\n\n"
    for s in sources:
        if not s["enabled"]:
            continue
        icon = status_icons.get(s["status"], "⚪")
        name = s["name"]
        errs = f" ⚠️{s['error_count']}" if s["error_count"] > 0 else ""
        text += f"  {icon} <code>{name}</code>{errs}\n"

    disabled = [s for s in sources if not s["enabled"]]
    if disabled:
        text += f"\n⚫ <i>{len(disabled)} disabled</i>"

    await query.edit_message_text(text, parse_mode="HTML")


async def _show_events_inline(query):
    from app.database import async_session
    from sqlalchemy import select, func
    from app.models.event import Event

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    async with async_session() as db:
        total = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > since)
        )).scalar()
        critical = (await db.execute(
            select(func.count(Event.id))
            .where(Event.created_at > since)
            .where(Event.severity >= 8)
        )).scalar()

    text = (
        f"📰 <b>Events (24h)</b>\n\n"
        f"Total: <b>{total:,}</b>\n"
        f"Critical (≥8): <b>{critical}</b>\n\n"
        f"Use /events or /critical for details."
    )

    keyboard = [[
        InlineKeyboardButton("🚨 Critical", callback_data="nav_critical"),
        InlineKeyboardButton("🏆 Top", callback_data="top_0"),
    ]]
    await query.edit_message_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(keyboard))


async def _show_critical_inline(query):
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.severity >= 8)
            .where(Event.created_at > since)
            .order_by(desc(Event.created_at))
            .limit(5)
        )
        events = result.scalars().all()

    if not events:
        await query.edit_message_text("✅ No critical events (24h)")
        return

    text = "🚨 <b>Latest Critical Events</b>\n\n"
    buttons = []
    for e in events:
        summary = (e.summary or e.raw_text or "")[:80]
        text += f"🔴 <b>[{e.severity}/10]</b> {e.category or '?'}\n  {summary}\n\n"
        buttons.append(InlineKeyboardButton(f"📰 #{e.id}", callback_data=f"event_{e.id}"))

    keyboard = [buttons[i:i+3] for i in range(0, len(buttons), 3)]
    await query.edit_message_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(keyboard))


async def _show_signals_inline(query):
    from app.database import async_session
    from app.telegram_bot.formatters.alerts import format_signals

    async with async_session() as db:
        text = await format_signals(db)

    await query.edit_message_text(text, parse_mode="HTML")


# ═══════════════════════════════════════════════════════════════════
# SOURCE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

async def _toggle_source(query, source_name: str):
    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()

    found = None
    for source in manager.sources:
        if source.name == source_name:
            found = source
            break

    if not found:
        await query.edit_message_text(f"❌ Source not found: {source_name}")
        return

    found.enabled = not found.enabled
    if found.enabled:
        found._error_count = 0
        found._backoff = 0
        found._disabled_at = None

    state = "🟢 ENABLED" if found.enabled else "🔴 DISABLED"
    await query.edit_message_text(
        f"🔧 <b>{found.name}</b> → {state}\n\n"
        f"Use /sources to see full status.",
        parse_mode="HTML",
    )


async def _restart_all_errored(query):
    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()

    count = 0
    for source in manager.sources:
        if source._error_count > 0:
            source._error_count = 0
            source._backoff = 0
            source._disabled_at = None
            source.enabled = True
            count += 1

    await query.edit_message_text(
        f"♻️ Restarted <b>{count}</b> errored sources.\n\nUse /sources to verify.",
        parse_mode="HTML",
    )


# ═══════════════════════════════════════════════════════════════════
# DETAIL VIEWS
# ═══════════════════════════════════════════════════════════════════

async def _show_market_detail(query, market_id: str):
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.market import Market, MarketSnapshot

    try:
        mid = int(market_id)
    except ValueError:
        await query.edit_message_text("❌ Invalid market ID")
        return

    async with async_session() as db:
        market = (await db.execute(
            select(Market).where(Market.id == mid)
        )).scalar_one_or_none()

        if not market:
            await query.edit_message_text("❌ Market not found")
            return

        snap = (await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id == mid)
            .order_by(desc(MarketSnapshot.captured_at))
            .limit(1)
        )).scalar_one_or_none()

    price_yes = f"{snap.price_yes:.1%}" if snap and snap.price_yes else "?"
    price_no = f"{snap.price_no:.1%}" if snap and snap.price_no else "?"
    volume = f"${snap.volume_24h:,.0f}" if snap and snap.volume_24h else "?"
    liquidity = f"${snap.liquidity:,.0f}" if snap and snap.liquidity else "?"

    text = (
        f"💹 <b>Market #{mid}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"❓ <b>{market.question}</b>\n\n"
        f"  ✅ YES: <b>{price_yes}</b>\n"
        f"  ❌ NO:  <b>{price_no}</b>\n"
        f"  📊 Volume 24h: {volume}\n"
        f"  💧 Liquidity: {liquidity}\n"
    )

    if market.category:
        text += f"  🏷️ Category: {market.category}\n"

    # Watch button
    keyboard = [[InlineKeyboardButton(f"👁️ Watch", callback_data=f"watch_market_{mid}")]]
    await query.edit_message_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(keyboard))


async def _show_event_detail(query, event_id: str):
    from app.database import async_session
    from sqlalchemy import select
    from app.models.event import Event

    try:
        eid = int(event_id)
    except ValueError:
        await query.edit_message_text("❌ Invalid event ID")
        return

    async with async_session() as db:
        event = (await db.execute(
            select(Event).where(Event.id == eid)
        )).scalar_one_or_none()

    if not event:
        await query.edit_message_text("❌ Event not found")
        return

    flag = ""
    if event.country and len(event.country) == 2:
        try:
            flag = chr(0x1F1E6 + ord(event.country[0].upper()) - ord("A")) + chr(0x1F1E6 + ord(event.country[1].upper()) - ord("A"))
        except Exception:
            flag = "🌍"

    sev_icon = "🔴" if event.severity >= 8 else "🟠" if event.severity >= 6 else "🟡" if event.severity >= 4 else "🟢"

    text = (
        f"📰 <b>Event #{event.id}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{sev_icon} Severity: <b>{event.severity}/10</b>\n"
        f"📌 Category: {event.category or '?'}\n"
        f"📡 Source: {event.source}\n"
    )

    if event.country:
        text += f"🌍 Country: {flag} {event.country}\n"

    if event.created_at:
        text += f"🕐 {event.created_at.strftime('%Y-%m-%d %H:%M UTC')}\n"

    if event.summary:
        text += f"\n📝 <b>Summary:</b>\n{event.summary[:600]}\n"
    elif event.raw_text:
        text += f"\n📝 {event.raw_text[:600]}\n"

    if event.keywords:
        tags = " ".join(f"#{k}" for k in event.keywords[:8])
        text += f"\n🏷️ {tags}\n"

    buttons = []
    if event.source_url:
        buttons.append(InlineKeyboardButton("🔗 Source", url=event.source_url))
    if event.image_url and event.image_url.startswith("http"):
        buttons.append(InlineKeyboardButton("🖼️ Image", url=event.image_url))

    keyboard = [buttons] if buttons else None
    await query.edit_message_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None,
        disable_web_page_preview=True,
    )


# ═══════════════════════════════════════════════════════════════════
# PAGINATION
# ═══════════════════════════════════════════════════════════════════

async def _paginate_critical(query, hours: int, offset: int):
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.severity >= 8)
            .where(Event.created_at > since)
            .order_by(desc(Event.created_at))
            .offset(offset)
            .limit(10)
        )
        events = result.scalars().all()

    if not events:
        await query.edit_message_text("📭 No more results.")
        return

    text = f"🚨 <b>Critical Events</b> (page {offset // 10 + 2})\n\n"
    for e in events:
        summary = (e.summary or e.raw_text or "")[:100]
        text += f"{'🔴' if e.severity >= 9 else '🟠'} <b>[{e.severity}/10]</b> {e.category or '?'}\n  {summary}\n\n"

    buttons = []
    if offset >= 10:
        buttons.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"critical_{hours}_{offset-10}"))
    if len(events) >= 10:
        buttons.append(InlineKeyboardButton("➡️ Next", callback_data=f"critical_{hours}_{offset+10}"))

    keyboard = [buttons] if buttons else None
    await query.edit_message_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None,
    )


async def _paginate_top(query, offset: int):
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event

    since = datetime.now(timezone.utc) - timedelta(hours=24)

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.created_at > since)
            .order_by(desc(Event.severity), desc(Event.created_at))
            .offset(offset)
            .limit(10)
        )
        events = result.scalars().all()

    if not events:
        await query.edit_message_text("📭 No more results.")
        return

    text = f"🏆 <b>Top Events</b> (page {offset // 10 + 1})\n\n"
    for i, e in enumerate(events, offset + 1):
        sev_icon = "🔴" if e.severity >= 8 else "🟠" if e.severity >= 6 else "🟡"
        summary = (e.summary or e.raw_text or "")[:80]
        text += f"{i}. {sev_icon} <b>{e.severity}/10</b> {e.category or '?'}\n   {summary}\n\n"

    buttons = []
    if offset >= 10:
        buttons.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"top_{offset-10}"))
    if len(events) >= 10:
        buttons.append(InlineKeyboardButton("➡️ Next", callback_data=f"top_{offset+10}"))

    # Detail buttons
    detail_buttons = [
        InlineKeyboardButton(f"#{e.id}", callback_data=f"event_{e.id}")
        for e in events[:5]
    ]

    keyboard = []
    if detail_buttons:
        keyboard.append(detail_buttons)
    if buttons:
        keyboard.append(buttons)

    await query.edit_message_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None,
    )


async def _paginate_search(query, search_query: str, offset: int):
    from app.database import async_session
    from sqlalchemy import select, desc, or_
    from app.models.event import Event

    pattern = f"%{search_query}%"

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(
                or_(
                    Event.summary.ilike(pattern),
                    Event.raw_text.ilike(pattern),
                )
            )
            .order_by(desc(Event.severity), desc(Event.created_at))
            .offset(offset)
            .limit(10)
        )
        events = result.scalars().all()

    if not events:
        await query.edit_message_text("📭 No more results.")
        return

    text = f"🔍 <b>Search: {search_query}</b> (page {offset // 10 + 1})\n\n"
    for e in events:
        summary = (e.summary or e.raw_text or "")[:80]
        sev_icon = "🔴" if e.severity >= 8 else "🟠" if e.severity >= 6 else "🟡" if e.severity >= 4 else "🟢"
        text += f"{sev_icon} <b>[{e.severity}]</b> {e.category or '?'}\n  {summary}\n\n"

    buttons = []
    if offset >= 10:
        buttons.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"search_{search_query}_{offset-10}"))
    if len(events) >= 10:
        buttons.append(InlineKeyboardButton("➡️ Next", callback_data=f"search_{search_query}_{offset+10}"))

    keyboard = [buttons] if buttons else None
    await query.edit_message_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None,
    )
