import logging
import asyncio
from datetime import datetime, timezone, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from app.config import get_settings
from app.telegram_bot.bot import admin_only

logger = logging.getLogger(__name__)
settings = get_settings()


# ═══════════════════════════════════════════════════════════════════
# WATCHLIST — keyword/market tracking
# ═══════════════════════════════════════════════════════════════════

_watchlist: list[dict] = []  # {"type": "keyword"|"market", "value": str, "added": datetime}


def get_watchlist() -> list[dict]:
    return _watchlist


# ═══════════════════════════════════════════════════════════════════
# ALERT STATE
# ═══════════════════════════════════════════════════════════════════

_alerts_enabled = True
_digest_enabled = True  # Auto daily digest
_digest_hour = 8  # UTC hour for daily digest


def are_alerts_enabled() -> bool:
    return _alerts_enabled


def is_digest_enabled() -> bool:
    return _digest_enabled


# ═══════════════════════════════════════════════════════════════════
# EXISTING COMMANDS (enhanced)
# ═══════════════════════════════════════════════════════════════════

# ── /sources — Detailed source status ──────────────────────────────

async def cmd_sources(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()
    sources = manager.get_status()

    text = "📡 <b>Data Sources</b>\n\n"

    status_icons = {
        "active": "🟢", "idle": "🟡", "error": "🔴", "disabled": "⚫",
    }

    enabled = [s for s in sources if s["enabled"]]
    disabled = [s for s in sources if not s["enabled"]]

    text += f"<b>Active Sources ({len(enabled)})</b>\n"
    for s in enabled:
        icon = status_icons.get(s["status"], "⚪")
        name = s["name"]
        errs = s["error_count"]
        last = _fmt_last_fetch(s["last_fetch"])
        interval = s.get("interval", "?")

        err_str = f" ⚠️{errs}" if errs > 0 else ""
        text += f"  {icon} <code>{name:20s}</code> {last:>7s} ⏱{interval}s{err_str}\n"

    if disabled:
        text += f"\n<b>Disabled ({len(disabled)})</b>\n"
        for s in disabled:
            text += f"  ⚫ <code>{s['name']}</code>\n"

    # Inline keyboard for quick toggles
    buttons = []
    for s in sources[:20]:
        label = f"{'🔴' if s['enabled'] else '🟢'} {s['name'][:15]}"
        buttons.append(InlineKeyboardButton(label, callback_data=f"toggle_{s['name']}"))

    keyboard = [buttons[i:i+2] for i in range(0, len(buttons), 2)]
    reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None

    await update.message.reply_text(text, parse_mode="HTML", reply_markup=reply_markup)


# ── /toggle <source> — Enable/disable a source ────────────────────

async def cmd_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "Usage: <code>/toggle &lt;source_name&gt;</code>\n"
            "Use /sources to see available names.",
            parse_mode="HTML",
        )
        return

    target = context.args[0].lower()
    source = _find_source(target)

    if not source:
        await update.message.reply_text(f"❌ Source <code>{target}</code> not found.", parse_mode="HTML")
        return

    source.enabled = not source.enabled
    new_state = "🟢 ENABLED" if source.enabled else "🔴 DISABLED"

    if source.enabled:
        source._error_count = 0
        source._backoff = 0
        source._disabled_at = None

    await update.message.reply_text(
        f"🔧 <b>{source.name}</b> → {new_state}",
        parse_mode="HTML",
    )


# ── /scan <source> — Force immediate scan ─────────────────────────

async def cmd_scan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "Usage: <code>/scan &lt;source_name&gt;</code>\n"
            "Forces an immediate scan of the specified source.",
            parse_mode="HTML",
        )
        return

    target = context.args[0].lower()
    source = _find_source(target)

    if not source:
        await update.message.reply_text(f"❌ Source <code>{target}</code> not found.", parse_mode="HTML")
        return

    msg = await update.message.reply_text(f"🔄 Scanning <b>{source.name}</b>...", parse_mode="HTML")

    try:
        events = await asyncio.wait_for(source.fetch(), timeout=60)
        await msg.edit_text(
            f"✅ <b>{source.name}</b> scan complete\n"
            f"📦 Fetched: <b>{len(events)}</b> events\n\n"
            + (_preview_events(events[:3]) if events else ""),
            parse_mode="HTML",
        )
    except asyncio.TimeoutError:
        await msg.edit_text(f"⏰ <b>{source.name}</b> scan timed out (60s)", parse_mode="HTML")
    except Exception as e:
        await msg.edit_text(f"❌ <b>{source.name}</b> scan failed:\n<code>{str(e)[:300]}</code>", parse_mode="HTML")


# ── /restart <source> — Reset errors + re-enable ──────────────────

async def cmd_restart(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        # Restart ALL sources
        from app.ingestion.manager import IngestionManager
        manager = IngestionManager()
        count = 0
        for source in manager.sources:
            if source._error_count > 0 or not source.enabled:
                source._error_count = 0
                source._backoff = 0
                source._disabled_at = None
                source.enabled = True
                count += 1
        await update.message.reply_text(
            f"♻️ Reset <b>{count}</b> sources (errors cleared, all re-enabled)",
            parse_mode="HTML",
        )
        return

    target = context.args[0].lower()
    source = _find_source(target)

    if not source:
        await update.message.reply_text(f"❌ Source <code>{target}</code> not found.", parse_mode="HTML")
        return

    old_errors = source._error_count
    source._error_count = 0
    source._backoff = 0
    source._disabled_at = None
    source.enabled = True

    await update.message.reply_text(
        f"♻️ <b>{source.name}</b> restarted\n"
        f"  Errors cleared: {old_errors} → 0\n"
        f"  Status: 🟢 ENABLED",
        parse_mode="HTML",
    )


# ── /db — Database statistics ──────────────────────────────────────

async def cmd_db(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.database import async_session
    from sqlalchemy import text

    async with async_session() as db:
        result = await db.execute(text("""
            SELECT relname AS table,
                   n_live_tup AS rows
            FROM pg_stat_user_tables
            ORDER BY n_live_tup DESC
            LIMIT 15
        """))
        tables = result.fetchall()

        size_result = await db.execute(text(
            "SELECT pg_size_pretty(pg_database_size(current_database()))"
        ))
        db_size = size_result.scalar()

        conn_result = await db.execute(text(
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
        ))
        active_conns = conn_result.scalar()

        # Disk usage per table
        disk_result = await db.execute(text("""
            SELECT relname,
                   pg_size_pretty(pg_total_relation_size(relid)) AS size
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
            LIMIT 10
        """))
        disk_usage = disk_result.fetchall()

    text_out = "🗄️ <b>Database Statistics</b>\n\n"
    text_out += f"💾 Total size: <b>{db_size}</b>\n"
    text_out += f"🔗 Active connections: <b>{active_conns}</b>\n\n"
    text_out += "<b>Row counts:</b>\n"

    for t in tables:
        rows = t.rows
        if rows > 1_000_000:
            row_str = f"{rows / 1_000_000:.1f}M"
        elif rows > 1_000:
            row_str = f"{rows / 1_000:.1f}K"
        else:
            row_str = str(rows)
        text_out += f"  📋 <code>{t.table:22s}</code> {row_str:>8s}\n"

    text_out += "\n<b>Disk usage:</b>\n"
    for d in disk_usage:
        text_out += f"  💽 <code>{d.relname:22s}</code> {d.size:>10s}\n"

    await update.message.reply_text(text_out, parse_mode="HTML")


# ── /critical — Recent critical events (severity >= 8) ────────────

async def cmd_critical(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event

    hours = 24
    if context.args:
        try:
            hours = int(context.args[0])
        except ValueError:
            pass

    async with async_session() as db:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        result = await db.execute(
            select(Event)
            .where(Event.severity >= 8)
            .where(Event.created_at > since)
            .order_by(desc(Event.created_at))
            .limit(15)
        )
        events = result.scalars().all()

    if not events:
        await update.message.reply_text(f"✅ No critical events in the last {hours}h.")
        return

    text = f"🚨 <b>Critical Events (last {hours}h)</b>\n\n"
    for e in events:
        sev = e.severity
        cat = e.category or "?"
        summary = (e.summary or e.raw_text or "")[:120]
        country = e.country or ""
        flag = _country_flag(country)
        src = e.source or "?"
        ago = _time_ago(e.created_at)

        text += f"{'🔴' if sev >= 9 else '🟠'} <b>[{sev}/10]</b> {flag} {cat}\n"
        text += f"  {summary}\n"
        text += f"  <i>{src} · {ago}</i>\n\n"

    # Pagination buttons
    keyboard = []
    if len(events) >= 15:
        keyboard.append([InlineKeyboardButton("📄 More...", callback_data=f"critical_{hours}_15")])

    reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=reply_markup)


# ── /events [hours] — Events summary by category ──────────────────

async def cmd_events_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.database import async_session
    from sqlalchemy import select, func, desc
    from app.models.event import Event

    hours = 24
    if context.args:
        try:
            hours = int(context.args[0])
        except ValueError:
            pass

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with async_session() as db:
        cat_result = await db.execute(
            select(Event.category, func.count(Event.id))
            .where(Event.created_at > since)
            .group_by(Event.category)
            .order_by(desc(func.count(Event.id)))
        )
        categories = cat_result.fetchall()

        src_result = await db.execute(
            select(Event.source, func.count(Event.id))
            .where(Event.created_at > since)
            .group_by(Event.source)
            .order_by(desc(func.count(Event.id)))
            .limit(10)
        )
        sources = src_result.fetchall()

        country_result = await db.execute(
            select(Event.country, func.count(Event.id))
            .where(Event.created_at > since)
            .where(Event.country.isnot(None))
            .group_by(Event.country)
            .order_by(desc(func.count(Event.id)))
            .limit(10)
        )
        countries = country_result.fetchall()

        total_result = await db.execute(
            select(func.count(Event.id)).where(Event.created_at > since)
        )
        total = total_result.scalar()

        sev_result = await db.execute(
            select(
                func.count(Event.id).filter(Event.severity >= 8).label("critical"),
                func.count(Event.id).filter(Event.severity >= 6, Event.severity < 8).label("high"),
                func.count(Event.id).filter(Event.severity >= 4, Event.severity < 6).label("medium"),
                func.count(Event.id).filter(Event.severity < 4).label("low"),
            ).where(Event.created_at > since)
        )
        sev = sev_result.fetchone()

    text = f"📰 <b>Events Summary (last {hours}h)</b>\n\n"
    text += f"📊 Total: <b>{total}</b>\n"
    text += f"  🔴 Critical: {sev.critical} | 🟠 High: {sev.high}\n"
    text += f"  🟡 Medium: {sev.medium} | 🟢 Low: {sev.low}\n\n"

    if categories:
        text += "<b>By Category:</b>\n"
        for cat, count in categories:
            icon = _cat_icon(cat)
            text += f"  {icon} {cat or 'UNKNOWN'}: {count}\n"

    if sources:
        text += "\n<b>Top Sources:</b>\n"
        for src, count in sources:
            text += f"  📡 {src}: {count}\n"

    if countries:
        text += "\n<b>Top Countries:</b>\n"
        for c, count in countries:
            flag = _country_flag(c)
            text += f"  {flag} {c}: {count}\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ═══════════════════════════════════════════════════════════════════
# NEW V2 COMMANDS
# ═══════════════════════════════════════════════════════════════════

# ── /search <query> — Full-text event search ──────────────────────

async def cmd_search(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "🔍 <b>Event Search</b>\n\n"
            "Usage: <code>/search &lt;keywords&gt;</code>\n"
            "Examples:\n"
            "  <code>/search ukraine missile</code>\n"
            "  <code>/search bitcoin crash</code>\n"
            "  <code>/search earthquake turkey</code>",
            parse_mode="HTML",
        )
        return

    query = " ".join(context.args)
    msg = await update.message.reply_text(f"🔍 Searching: <i>{query}</i>...", parse_mode="HTML")

    from app.database import async_session
    from sqlalchemy import select, desc, or_
    from app.models.event import Event

    # Build search — look in summary, raw_text, category, source, country
    search_pattern = f"%{query}%"

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(
                or_(
                    Event.summary.ilike(search_pattern),
                    Event.raw_text.ilike(search_pattern),
                    Event.category.ilike(search_pattern),
                    Event.country.ilike(search_pattern),
                )
            )
            .order_by(desc(Event.severity), desc(Event.created_at))
            .limit(15)
        )
        events = result.scalars().all()

    if not events:
        await msg.edit_text(f"🔍 No results for: <i>{query}</i>", parse_mode="HTML")
        return

    text = f"🔍 <b>Search: {query}</b> ({len(events)} results)\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for e in events:
        sev_icon = "🔴" if e.severity >= 8 else "🟠" if e.severity >= 6 else "🟡" if e.severity >= 4 else "🟢"
        flag = _country_flag(e.country or "")
        summary = (e.summary or e.raw_text or "")[:100]
        ago = _time_ago(e.created_at)

        text += f"{sev_icon} <b>[{e.severity}]</b> {flag} {e.category or '?'}\n"
        text += f"  {summary}\n"
        text += f"  <i>{e.source} · {ago}</i>\n\n"

    # Detail buttons for top 5
    buttons = []
    for e in events[:5]:
        buttons.append(InlineKeyboardButton(
            f"📰 #{e.id}", callback_data=f"event_{e.id}"
        ))
    keyboard = [buttons[i:i+3] for i in range(0, len(buttons), 3)]

    await msg.edit_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard) if keyboard else None,
    )


# ── /top [N] — Top events by severity ─────────────────────────────

async def cmd_top(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event

    limit = 10
    if context.args:
        try:
            limit = min(int(context.args[0]), 25)
        except ValueError:
            pass

    since = datetime.now(timezone.utc) - timedelta(hours=24)

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.created_at > since)
            .order_by(desc(Event.severity), desc(Event.created_at))
            .limit(limit)
        )
        events = result.scalars().all()

    if not events:
        await update.message.reply_text("📭 No events in the last 24h.")
        return

    text = f"🏆 <b>Top {limit} Events (24h)</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for i, e in enumerate(events, 1):
        sev_icon = "🔴" if e.severity >= 8 else "🟠" if e.severity >= 6 else "🟡" if e.severity >= 4 else "🟢"
        flag = _country_flag(e.country or "")
        summary = (e.summary or e.raw_text or "")[:80]
        ago = _time_ago(e.created_at)

        text += f"{i}. {sev_icon} <b>{e.severity}/10</b> {flag} {e.category or '?'}\n"
        text += f"   {summary}\n"
        text += f"   <i>{e.source} · {ago}</i>\n\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ── /market <id|query> — Market detail ─────────────────────────────

async def cmd_market(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "Usage: <code>/market &lt;id&gt;</code> or <code>/market &lt;search&gt;</code>",
            parse_mode="HTML",
        )
        return

    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.market import Market, MarketSnapshot

    arg = " ".join(context.args)

    async with async_session() as db:
        # Try by ID first
        try:
            mid = int(arg)
            market = (await db.execute(
                select(Market).where(Market.id == mid)
            )).scalar_one_or_none()
        except ValueError:
            # Search by question
            market = (await db.execute(
                select(Market)
                .where(Market.question.ilike(f"%{arg}%"))
                .where(Market.active == True)
                .order_by(desc(Market.updated_at))
                .limit(1)
            )).scalar_one_or_none()

        if not market:
            await update.message.reply_text(f"❌ Market not found: <i>{arg}</i>", parse_mode="HTML")
            return

        # Get snapshots for price history
        snaps = (await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id == market.id)
            .order_by(desc(MarketSnapshot.captured_at))
            .limit(24)
        )).scalars().all()

    snap = snaps[0] if snaps else None
    price_yes = f"{snap.price_yes:.1%}" if snap and snap.price_yes else "?"
    price_no = f"{snap.price_no:.1%}" if snap and snap.price_no else "?"
    volume = f"${snap.volume_24h:,.0f}" if snap and snap.volume_24h else "?"
    liquidity = f"${snap.liquidity:,.0f}" if snap and snap.liquidity else "?"

    text = (
        f"💹 <b>Market #{market.id}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"❓ <b>{market.question}</b>\n\n"
        f"  ✅ YES: <b>{price_yes}</b>\n"
        f"  ❌ NO:  <b>{price_no}</b>\n"
        f"  📊 Volume 24h: {volume}\n"
        f"  💧 Liquidity: {liquidity}\n"
    )

    if market.category:
        text += f"  🏷️ Category: {market.category}\n"

    # Price sparkline from snapshots
    if len(snaps) >= 2:
        prices = [s.price_yes for s in reversed(snaps) if s.price_yes]
        if len(prices) >= 2:
            sparkline = _sparkline(prices)
            delta = prices[-1] - prices[0]
            delta_icon = "📈" if delta > 0 else "📉" if delta < 0 else "➡️"
            text += f"\n  {delta_icon} Trend: {sparkline} ({delta:+.1%})\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ── /watch <keyword|market_id> — Watch for alerts ─────────────────

async def cmd_watch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "👁️ <b>Watchlist</b>\n\n"
            "Usage:\n"
            "  <code>/watch ukraine</code> — Watch keyword\n"
            "  <code>/watch market:42</code> — Watch market ID\n"
            "  <code>/watchlist</code> — View all watches\n"
            "  <code>/unwatch ukraine</code> — Remove watch",
            parse_mode="HTML",
        )
        return

    value = " ".join(context.args)

    if value.startswith("market:"):
        watch_type = "market"
        watch_value = value[7:].strip()
    else:
        watch_type = "keyword"
        watch_value = value.lower()

    # Check for duplicates
    for w in _watchlist:
        if w["type"] == watch_type and w["value"] == watch_value:
            await update.message.reply_text(f"⚠️ Already watching: <b>{watch_value}</b>", parse_mode="HTML")
            return

    _watchlist.append({
        "type": watch_type,
        "value": watch_value,
        "added": datetime.now(timezone.utc),
    })

    icon = "📈" if watch_type == "market" else "🔍"
    await update.message.reply_text(
        f"{icon} Watching: <b>{watch_value}</b> ({watch_type})\n"
        f"📝 Watchlist: {len(_watchlist)} items",
        parse_mode="HTML",
    )


# ── /unwatch <keyword|market_id> — Remove watch ──────────────────

async def cmd_unwatch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text("Usage: <code>/unwatch &lt;keyword&gt;</code>", parse_mode="HTML")
        return

    value = " ".join(context.args).lower()
    removed = False
    for w in _watchlist[:]:
        if w["value"] == value:
            _watchlist.remove(w)
            removed = True
            break

    if removed:
        await update.message.reply_text(f"✅ Removed: <b>{value}</b>", parse_mode="HTML")
    else:
        await update.message.reply_text(f"❌ Not found in watchlist: <b>{value}</b>", parse_mode="HTML")


# ── /watchlist — View all watches ─────────────────────────────────

async def cmd_watchlist(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not _watchlist:
        await update.message.reply_text(
            "📝 Watchlist is empty.\n\n"
            "Use <code>/watch &lt;keyword&gt;</code> to add items.",
            parse_mode="HTML",
        )
        return

    text = f"📝 <b>Watchlist</b> ({len(_watchlist)} items)\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"

    for w in _watchlist:
        icon = "📈" if w["type"] == "market" else "🔍"
        added = _time_ago(w["added"])
        text += f"  {icon} <b>{w['value']}</b> ({w['type']}) — {added}\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ── /stats — Event rate statistics ─────────────────────────────────

async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.database import async_session
    from sqlalchemy import select, func
    from app.models.event import Event

    now = datetime.now(timezone.utc)

    async with async_session() as db:
        # Events per hour for last 12 hours
        hours_data = []
        for h in range(12):
            start = now - timedelta(hours=h+1)
            end = now - timedelta(hours=h)
            count = (await db.execute(
                select(func.count(Event.id))
                .where(Event.created_at > start)
                .where(Event.created_at <= end)
            )).scalar()
            hours_data.append(count)

        # Events per source (last 24h)
        since_24h = now - timedelta(hours=24)
        src_result = await db.execute(
            select(Event.source, func.count(Event.id))
            .where(Event.created_at > since_24h)
            .group_by(Event.source)
            .order_by(desc(func.count(Event.id)))
            .limit(10)
        )
        sources = src_result.fetchall()

        # Total last 1h, 6h, 24h
        h1 = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > now - timedelta(hours=1))
        )).scalar()
        h6 = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > now - timedelta(hours=6))
        )).scalar()
        h24 = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > now - timedelta(hours=24))
        )).scalar()

    # Sparkline for hourly rate
    hours_data.reverse()
    sparkline = _sparkline(hours_data) if hours_data else ""

    text = "📉 <b>Event Rate Statistics</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    text += f"📊 <b>Volume:</b>\n"
    text += f"  Last 1h:  <b>{h1}</b> events ({h1/60:.1f}/min)\n"
    text += f"  Last 6h:  <b>{h6}</b> events ({h6/360:.1f}/min)\n"
    text += f"  Last 24h: <b>{h24}</b> events ({h24/1440:.1f}/min)\n\n"

    text += f"📈 <b>Hourly Rate (12h):</b>\n"
    text += f"  {sparkline}\n"

    # Show hourly numbers
    for i, count in enumerate(hours_data):
        hour_label = (now - timedelta(hours=12-i)).strftime("%H:00")
        bar = "█" * min(int(count / max(max(hours_data, default=1), 1) * 15), 15)
        text += f"  <code>{hour_label}</code> {bar} {count}\n"

    if sources:
        text += "\n<b>Events/Source (24h):</b>\n"
        for src, count in sources:
            text += f"  📡 <code>{src:18s}</code> {count:>5}\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ── /digest — Manual daily intelligence digest ────────────────────

async def cmd_digest(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    # Toggle auto-digest or send now
    global _digest_enabled
    if context.args:
        arg = context.args[0].lower()
        if arg in ("on", "enable"):
            _digest_enabled = True
            await update.message.reply_text("📋 Auto-digest: <b>🔔 ON</b> (daily at 08:00 UTC)", parse_mode="HTML")
            return
        elif arg in ("off", "disable"):
            _digest_enabled = False
            await update.message.reply_text("📋 Auto-digest: <b>🔕 OFF</b>", parse_mode="HTML")
            return

    msg = await update.message.reply_text("📋 Generating digest...", parse_mode="HTML")
    text = await _generate_digest()
    await msg.edit_text(text, parse_mode="HTML")


# ── /purge <table> <hours> — Clean old data ───────────────────────

async def cmd_purge(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args or len(context.args) < 2:
        await update.message.reply_text(
            "🗑️ <b>Purge Old Data</b>\n\n"
            "Usage: <code>/purge &lt;table&gt; &lt;hours&gt;</code>\n\n"
            "Tables: <code>events</code>, <code>flights</code>, <code>vessels</code>, <code>snapshots</code>\n"
            "Example: <code>/purge flights 48</code> — delete flight tracks older than 48h",
            parse_mode="HTML",
        )
        return

    table = context.args[0].lower()
    try:
        hours = int(context.args[1])
    except ValueError:
        await update.message.reply_text("❌ Hours must be a number.", parse_mode="HTML")
        return

    if hours < 6:
        await update.message.reply_text("❌ Minimum purge window is 6 hours.", parse_mode="HTML")
        return

    from app.database import async_session
    from sqlalchemy import delete

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    deleted = 0

    async with async_session() as db:
        if table == "flights":
            from app.models.tracking import FlightTrack
            result = await db.execute(delete(FlightTrack).where(FlightTrack.captured_at < cutoff))
            deleted = result.rowcount
        elif table == "vessels":
            from app.models.tracking import VesselTrack
            result = await db.execute(delete(VesselTrack).where(VesselTrack.captured_at < cutoff))
            deleted = result.rowcount
        elif table == "events":
            from app.models.event import Event
            result = await db.execute(delete(Event).where(Event.created_at < cutoff))
            deleted = result.rowcount
        elif table == "snapshots":
            from app.models.market import MarketSnapshot
            result = await db.execute(delete(MarketSnapshot).where(MarketSnapshot.captured_at < cutoff))
            deleted = result.rowcount
        else:
            await update.message.reply_text(f"❌ Unknown table: <code>{table}</code>", parse_mode="HTML")
            return

        await db.commit()

    await update.message.reply_text(
        f"🗑️ Purged <b>{deleted:,}</b> rows from <code>{table}</code> older than {hours}h.",
        parse_mode="HTML",
    )


# ── /alerts [on|off] — Toggle auto-alerting ───────────────────────

async def cmd_alerts_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global _alerts_enabled

    if not await admin_only(update, context):
        return

    if context.args:
        arg = context.args[0].lower()
        if arg in ("on", "1", "true", "enable"):
            _alerts_enabled = True
        elif arg in ("off", "0", "false", "disable"):
            _alerts_enabled = False
    else:
        _alerts_enabled = not _alerts_enabled

    state = "🔔 ON" if _alerts_enabled else "🔕 OFF"
    digest_state = "🔔 ON" if _digest_enabled else "🔕 OFF"

    await update.message.reply_text(
        f"<b>Notification Settings:</b>\n\n"
        f"  Auto-alerts: <b>{state}</b>\n"
        f"  Daily digest: <b>{digest_state}</b>\n\n"
        f"When alerts ON, you receive:\n"
        f"  🚨 Critical events (severity ≥ 8)\n"
        f"  ⚡ High-confidence signals\n"
        f"  🌡️ Tension spikes\n"
        f"  🔴 Source failures\n"
        f"  👁️ Watchlist matches\n"
        f"  📸 Event images when available",
        parse_mode="HTML",
    )


# ── /broadcast <message> — Send WebSocket broadcast ───────────────

async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    if not context.args:
        await update.message.reply_text(
            "Usage: <code>/broadcast &lt;message&gt;</code>\n"
            "Sends a message to all connected frontend clients via WebSocket.",
            parse_mode="HTML",
        )
        return

    message = " ".join(context.args)

    from app.websocket import emit_to_all
    await emit_to_all("admin_broadcast", {
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    await update.message.reply_text(f"📢 Broadcast sent:\n<i>{message}</i>", parse_mode="HTML")


# ── /logs [source] — Recent error logs ─────────────────────────────

async def cmd_logs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()
    sources = manager.get_status()

    filter_name = context.args[0].lower() if context.args else None

    errored = []
    for s in sources:
        if filter_name and filter_name not in s["name"].lower():
            continue
        if s["error_count"] > 0 or s["status"] == "error":
            errored.append(s)

    if not errored:
        await update.message.reply_text("✅ No source errors currently.")
        return

    text = "📋 <b>Source Error Log</b>\n\n"
    for s in sorted(errored, key=lambda x: x["error_count"], reverse=True):
        err_bar = "🔴" * min(s["error_count"], 10) + "⚪" * max(0, 10 - s["error_count"])
        text += f"<b>{s['name']}</b>\n"
        text += f"  [{err_bar}] {s['error_count']}/10\n"
        text += f"  Status: {s['status']} | Last: {_fmt_last_fetch(s['last_fetch'])}\n\n"

    # Quick restart button
    keyboard = [[InlineKeyboardButton("♻️ Restart All Errored", callback_data="restart_all_errored")]]
    await update.message.reply_text(
        text, parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ── /config — View current configuration ──────────────────────────

async def cmd_config(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    text = "⚙️ <b>SONAR Configuration</b>\n\n"

    text += "<b>Intervals:</b>\n"
    text += f"  📡 Scan: {settings.scan_interval_seconds}s\n"
    text += f"  ✈️ Flights: {settings.flight_scan_interval}s\n"
    text += f"  🚢 Vessels: {settings.vessel_scan_interval}s\n"
    text += f"  🌡️ Tension: {settings.tension_update_interval}s\n\n"

    text += "<b>Thresholds:</b>\n"
    text += f"  🚨 Alert min severity: {settings.alert_min_severity}\n"
    text += f"  📊 Signal min confidence: {settings.signal_min_confidence}\n"
    text += f"  💰 Mispricing min %: {settings.mispricing_min_pct}%\n\n"

    text += "<b>Feature Flags:</b>\n"
    flags = {
        "RSS": settings.enable_rss,
        "GDELT": settings.enable_gdelt,
        "Twitter": settings.enable_twitter,
        "Telegram Mon": settings.enable_telegram_monitor,
        "Flights": settings.enable_flight_tracking,
        "Vessels": settings.enable_vessel_tracking,
        "Earthquake": settings.enable_earthquake,
        "Weather": settings.enable_weather,
        "Fire": settings.enable_fire,
        "Nuclear": settings.enable_nuclear,
        "Webcams": settings.enable_webcams,
        "Polymarket": settings.enable_polymarket,
        "YouTube": settings.enable_youtube,
        "Reddit": settings.enable_reddit,
        "ACLED": settings.enable_acled,
        "Gov Feeds": settings.enable_government_feeds,
        "Conflict Mon": settings.enable_conflict_monitor,
        "Cyber": settings.enable_cyber_threats,
        "Sanctions": settings.enable_sanctions_trade,
        "Shodan": settings.enable_shodan,
    }

    for name, enabled in flags.items():
        icon = "✅" if enabled else "❌"
        text += f"  {icon} {name}\n"

    text += f"\n<b>API Keys:</b>\n"
    keys = {
        "Telegram Bot": bool(settings.telegram_bot_token),
        "OpenSky": bool(settings.opensky_username),
        "AISstream": bool(settings.aisstream_api_key),
        "NASA FIRMS": bool(settings.nasa_firms_map_key),
        "Twitter": bool(settings.twitter_bearer_token),
        "YouTube": bool(settings.youtube_api_key),
        "Shodan": bool(settings.shodan_api_key),
        "ACLED": bool(settings.acled_api_key),
    }
    for name, has_key in keys.items():
        icon = "🔑" if has_key else "🚫"
        text += f"  {icon} {name}\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ── /uptime — System uptime and memory ─────────────────────────────

_start_time = datetime.now(timezone.utc)


async def cmd_uptime(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await admin_only(update, context):
        return

    import os
    try:
        import psutil
        process = psutil.Process(os.getpid())
        mem = process.memory_info()
        mem_str = f"{mem.rss / 1024 / 1024:.0f} MB"
        cpu = process.cpu_percent(interval=0.1)

        # System-wide
        sys_mem = psutil.virtual_memory()
        sys_mem_str = f"{sys_mem.used / 1024 / 1024 / 1024:.1f}/{sys_mem.total / 1024 / 1024 / 1024:.1f} GB ({sys_mem.percent}%)"
        disk = psutil.disk_usage("/")
        disk_str = f"{disk.used / 1024 / 1024 / 1024:.1f}/{disk.total / 1024 / 1024 / 1024:.1f} GB ({disk.percent}%)"
    except ImportError:
        mem_str = "N/A"
        cpu = 0
        sys_mem_str = "N/A"
        disk_str = "N/A"

    uptime = datetime.now(timezone.utc) - _start_time
    days = uptime.days
    hours = uptime.seconds // 3600
    minutes = (uptime.seconds % 3600) // 60

    text = "⏱️ <b>System Status</b>\n"
    text += "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    text += f"🕐 Uptime: <b>{days}d {hours}h {minutes}m</b>\n"
    text += f"🚀 Started: {_start_time.strftime('%Y-%m-%d %H:%M UTC')}\n\n"

    text += "<b>Process:</b>\n"
    text += f"  💾 Memory: <b>{mem_str}</b>\n"
    text += f"  🔧 CPU: <b>{cpu:.1f}%</b>\n\n"

    text += "<b>System:</b>\n"
    text += f"  🖥️ RAM: {sys_mem_str}\n"
    text += f"  💽 Disk: {disk_str}\n"

    # Redis check
    try:
        from app.redis_client import get_redis
        r = await get_redis()
        info = await r.info("memory")
        redis_mem = info.get("used_memory_human", "?")
        clients = info.get("connected_clients", "?")

        hash_count = await r.scard("event_hashes")
        text += f"\n<b>Redis:</b>\n"
        text += f"  📦 Memory: {redis_mem}\n"
        text += f"  👥 Clients: {clients}\n"
        text += f"  🔑 Dedup hashes: {hash_count}\n"
    except Exception:
        text += "\n📦 Redis: <i>unavailable</i>\n"

    await update.message.reply_text(text, parse_mode="HTML")


# ═══════════════════════════════════════════════════════════════════
# DIGEST GENERATOR
# ═══════════════════════════════════════════════════════════════════

async def _generate_digest() -> str:
    """Generate a comprehensive intelligence digest."""
    from app.database import async_session
    from sqlalchemy import select, func, desc
    from app.models.event import Event
    from app.models.market import Market
    from app.models.signal import Signal
    from app.models.tension import TensionHistory

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    async with async_session() as db:
        # Events count + critical
        total_events = (await db.execute(
            select(func.count(Event.id)).where(Event.created_at > since)
        )).scalar()
        critical_events = (await db.execute(
            select(func.count(Event.id))
            .where(Event.created_at > since)
            .where(Event.severity >= 8)
        )).scalar()

        # Top 3 critical events
        top_events = (await db.execute(
            select(Event)
            .where(Event.created_at > since)
            .order_by(desc(Event.severity), desc(Event.created_at))
            .limit(3)
        )).scalars().all()

        # Active markets + signals
        markets_count = (await db.execute(
            select(func.count(Market.id)).where(Market.active == True)
        )).scalar()
        signals_count = (await db.execute(
            select(func.count(Signal.id)).where(Signal.status == "active")
        )).scalar()

        # Tension
        tension = (await db.execute(
            select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(1)
        )).scalar_one_or_none()

        # Top categories
        cat_result = await db.execute(
            select(Event.category, func.count(Event.id))
            .where(Event.created_at > since)
            .group_by(Event.category)
            .order_by(desc(func.count(Event.id)))
            .limit(5)
        )
        top_cats = cat_result.fetchall()

    # Sources health
    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()
    sources = manager.get_status()
    online = sum(1 for s in sources if s["healthy"] and s["enabled"])
    total_src = sum(1 for s in sources if s["enabled"])

    date_str = now.strftime("%Y-%m-%d")
    text = (
        f"📋 <b>SONAR Daily Digest</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 {date_str}\n\n"
    )

    # Tension
    if tension:
        level_icons = {"CALM": "🟢", "GUARDED": "🟡", "ELEVATED": "🟠", "HIGH": "🔴", "CRITICAL": "⚫"}
        icon = level_icons.get(tension.level, "⚪")
        bars = int(tension.score)
        text += f"🌡️ Tension: [{('█' * bars + '░' * (10 - bars))}] <b>{tension.score:.1f}/10</b> {icon}\n\n"

    # Overview
    text += f"📊 <b>24h Overview:</b>\n"
    text += f"  📰 Events: <b>{total_events:,}</b> (🚨 {critical_events} critical)\n"
    text += f"  📡 Sources: <b>{online}/{total_src}</b> online\n"
    text += f"  💹 Markets: <b>{markets_count:,}</b> active\n"
    text += f"  ⚡ Signals: <b>{signals_count}</b> active\n\n"

    # Top categories
    if top_cats:
        text += "<b>Top Categories:</b>\n"
        for cat, count in top_cats:
            icon = _cat_icon(cat)
            text += f"  {icon} {cat or 'UNKNOWN'}: {count}\n"

    # Top events
    if top_events:
        text += "\n<b>Top Events:</b>\n"
        for e in top_events:
            sev_icon = "🔴" if e.severity >= 8 else "🟠"
            flag = _country_flag(e.country or "")
            text += f"  {sev_icon} [{e.severity}/10] {flag} {(e.summary or e.raw_text or '')[:80]}\n"

    text += f"\n<i>Generated at {now.strftime('%H:%M UTC')}</i>"
    return text


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def _find_source(name: str):
    """Find a source by name (case-insensitive)."""
    from app.ingestion.manager import IngestionManager
    manager = IngestionManager()
    for source in manager.sources:
        if source.name.lower() == name.lower():
            return source
    return None


def _preview_events(events) -> str:
    """Short preview of first few events from a scan."""
    lines = []
    for e in events:
        text = e.text[:80] if hasattr(e, 'text') and e.text else "?"
        lines.append(f"  • {text}")
    return "\n".join(lines)


def _country_flag(code: str) -> str:
    if not code or len(code) != 2:
        return "🌍"
    try:
        return chr(0x1F1E6 + ord(code[0].upper()) - ord("A")) + chr(0x1F1E6 + ord(code[1].upper()) - ord("A"))
    except Exception:
        return "🌍"


def _time_ago(dt: datetime | None) -> str:
    if not dt:
        return "?"
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ago = (datetime.now(timezone.utc) - dt).total_seconds()
        if ago < 60:
            return f"{int(ago)}s ago"
        if ago < 3600:
            return f"{int(ago // 60)}m ago"
        if ago < 86400:
            return f"{int(ago // 3600)}h ago"
        return f"{int(ago // 86400)}d ago"
    except Exception:
        return "?"


def _fmt_last_fetch(last_fetch: str | None) -> str:
    if not last_fetch:
        return "never"
    try:
        dt = datetime.fromisoformat(last_fetch)
        ago = int((datetime.now(timezone.utc) - dt).total_seconds())
        if ago < 60:
            return f"{ago}s"
        if ago < 3600:
            return f"{ago // 60}m"
        return f"{ago // 3600}h"
    except Exception:
        return "?"


def _cat_icon(cat: str | None) -> str:
    icons = {
        "MILITARY_CONFLICT": "⚔️", "DIPLOMATIC": "🤝", "ECONOMIC_POLICY": "💰",
        "POLITICAL_DOMESTIC": "🏛️", "NATURAL_DISASTER": "🌊", "CRYPTO_MARKET": "₿",
        "ENERGY_COMMODITIES": "⛽", "TECHNOLOGY": "💻", "NUCLEAR": "☢️",
        "MARITIME_SECURITY": "🚢", "AVIATION_INCIDENT": "✈️", "SANCTIONS": "🚫",
        "TERRORISM": "💣", "ELECTION": "🗳️", "INFRASTRUCTURE": "🏗️",
        "PANDEMIC_HEALTH": "🏥",
    }
    return icons.get(cat, "📌")


def _sparkline(values: list) -> str:
    """Generate a sparkline from a list of numbers."""
    if not values:
        return ""
    blocks = " ▁▂▃▄▅▆▇█"
    mn = min(values)
    mx = max(values)
    rng = mx - mn if mx != mn else 1
    return "".join(blocks[min(int((v - mn) / rng * 8), 8)] for v in values)
