"""
Auto-alerting system for SONAR Telegram bot.

Background loops:
1. alert_loop — checks for critical events, signals, tension spikes, source failures
2. digest_scheduler — sends daily digest at configured hour
3. watchlist_checker — monitors watched keywords/markets
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Track what we've already alerted on
_alerted_event_ids: set[int] = set()
_alerted_signal_ids: set[int] = set()
_last_tension_level: str | None = None
_alerted_source_errors: set[str] = set()
_last_digest_date: str | None = None

_MAX_TRACKED = 500
CHECK_INTERVAL = 45  # seconds between alert checks
WATCHLIST_INTERVAL = 90  # seconds between watchlist checks


# ═══════════════════════════════════════════════════════════════════
# MAIN ALERT LOOP
# ═══════════════════════════════════════════════════════════════════

async def alert_loop():
    """Background loop checking for alertable conditions."""
    logger.info("🔔 Alert system started (interval=%ds)", CHECK_INTERVAL)
    await asyncio.sleep(30)  # Wait for system init

    while True:
        try:
            from app.telegram_bot.handlers.admin import are_alerts_enabled
            if are_alerts_enabled():
                await _check_critical_events()
                await _check_new_signals()
                await _check_tension_spike()
                await _check_source_failures()
        except Exception as e:
            logger.error(f"Alert loop error: {e}")

        await asyncio.sleep(CHECK_INTERVAL)


# ═══════════════════════════════════════════════════════════════════
# DAILY DIGEST SCHEDULER
# ═══════════════════════════════════════════════════════════════════

async def digest_scheduler():
    """Sends a daily intelligence digest at the configured hour."""
    logger.info("📋 Digest scheduler started")
    await asyncio.sleep(60)

    global _last_digest_date

    while True:
        try:
            from app.telegram_bot.handlers.admin import is_digest_enabled
            now = datetime.now(timezone.utc)
            today = now.strftime("%Y-%m-%d")

            # Send at 08:00 UTC if not already sent today
            if (is_digest_enabled()
                    and now.hour == 8
                    and _last_digest_date != today):
                _last_digest_date = today
                from app.telegram_bot.handlers.admin import _generate_digest
                from app.telegram_bot.bot import send_admin_message

                text = await _generate_digest()
                text = "☀️ <b>Good Morning!</b>\n\n" + text
                await send_admin_message(text)
                logger.info("📋 Daily digest sent")

        except Exception as e:
            logger.error(f"Digest scheduler error: {e}")

        await asyncio.sleep(300)  # Check every 5 minutes


# ═══════════════════════════════════════════════════════════════════
# WATCHLIST CHECKER
# ═══════════════════════════════════════════════════════════════════

_watchlist_last_check = datetime.now(timezone.utc)


async def watchlist_checker():
    """Monitors watched keywords and markets for matches."""
    global _watchlist_last_check
    logger.info("👁️ Watchlist checker started")
    await asyncio.sleep(45)

    while True:
        try:
            from app.telegram_bot.handlers.admin import get_watchlist, are_alerts_enabled
            watchlist = get_watchlist()

            if watchlist and are_alerts_enabled():
                await _check_keyword_watches(watchlist)
                await _check_market_watches(watchlist)

            _watchlist_last_check = datetime.now(timezone.utc)
        except Exception as e:
            logger.error(f"Watchlist checker error: {e}")

        await asyncio.sleep(WATCHLIST_INTERVAL)


async def _check_keyword_watches(watchlist: list[dict]):
    """Check for new events matching watched keywords."""
    keywords = [w for w in watchlist if w["type"] == "keyword"]
    if not keywords:
        return

    from app.database import async_session
    from sqlalchemy import select, desc, or_
    from app.models.event import Event
    from app.telegram_bot.bot import send_admin_message, send_admin_photo

    since = _watchlist_last_check - timedelta(seconds=10)  # Small overlap to avoid gaps

    async with async_session() as db:
        for kw in keywords:
            pattern = f"%{kw['value']}%"
            result = await db.execute(
                select(Event)
                .where(Event.created_at > since)
                .where(
                    or_(
                        Event.summary.ilike(pattern),
                        Event.raw_text.ilike(pattern),
                    )
                )
                .order_by(desc(Event.severity))
                .limit(3)
            )
            events = result.scalars().all()

            for event in events:
                if event.id in _alerted_event_ids:
                    continue
                _alerted_event_ids.add(event.id)
                _trim_set(_alerted_event_ids)

                flag = _country_flag(event.country or "")
                summary = (event.summary or event.raw_text or "")[:250]

                text = (
                    f"👁️ <b>WATCHLIST MATCH</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🔍 Keyword: <b>{kw['value']}</b>\n\n"
                    f"⚠️ Severity: <b>{event.severity}/10</b>\n"
                    f"📌 {event.category or '?'} {flag}\n"
                    f"📡 {event.source}\n\n"
                    f"📝 {summary}\n"
                )

                if event.source_url:
                    text += f'\n🔗 <a href="{event.source_url}">Source</a>'

                # Send with image if available
                if event.image_url and event.image_url.startswith("http"):
                    await send_admin_photo(event.image_url, text)
                else:
                    await send_admin_message(text)

                logger.info(f"👁️ Watchlist alert: '{kw['value']}' matched event #{event.id}")


async def _check_market_watches(watchlist: list[dict]):
    """Check for price changes in watched markets."""
    market_watches = [w for w in watchlist if w["type"] == "market"]
    if not market_watches:
        return

    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.market import Market, MarketSnapshot
    from app.telegram_bot.bot import send_admin_message

    async with async_session() as db:
        for mw in market_watches:
            try:
                mid = int(mw["value"])
            except ValueError:
                continue

            snaps = (await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.market_id == mid)
                .order_by(desc(MarketSnapshot.captured_at))
                .limit(2)
            )).scalars().all()

            if len(snaps) < 2 or not snaps[0].price_yes or not snaps[1].price_yes:
                continue

            delta = abs(snaps[0].price_yes - snaps[1].price_yes)
            if delta < 0.03:  # Only alert on 3%+ moves
                continue

            market = (await db.execute(
                select(Market).where(Market.id == mid)
            )).scalar_one_or_none()

            if not market:
                continue

            direction = "📈" if snaps[0].price_yes > snaps[1].price_yes else "📉"
            change = snaps[0].price_yes - snaps[1].price_yes

            text = (
                f"📈 <b>MARKET ALERT</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"💹 Market #{mid}\n\n"
                f"❓ {market.question[:100]}\n\n"
                f"  {direction} Price: <b>{snaps[0].price_yes:.1%}</b> ({change:+.1%})\n"
                f"  📊 Previous: {snaps[1].price_yes:.1%}\n"
            )

            await send_admin_message(text)
            logger.info(f"📈 Market alert: #{mid} moved {change:+.1%}")


# ═══════════════════════════════════════════════════════════════════
# ALERT CHECKERS
# ═══════════════════════════════════════════════════════════════════

async def _check_critical_events():
    """Alert on new events with severity >= 8, with media support."""
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.event import Event
    from app.telegram_bot.bot import send_admin_message, send_admin_photo

    since = datetime.now(timezone.utc) - timedelta(minutes=2)

    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.severity >= 8)
            .where(Event.created_at > since)
            .order_by(desc(Event.created_at))
            .limit(5)
        )
        events = result.scalars().all()

    for event in events:
        if event.id in _alerted_event_ids:
            continue

        _alerted_event_ids.add(event.id)
        _trim_set(_alerted_event_ids)

        country = event.country or ""
        flag = _country_flag(country)
        cat = event.category or "UNKNOWN"
        summary = (event.summary or event.raw_text or "No details")[:300]
        source = event.source or "?"

        sev_icon = "🔴" if event.severity >= 9 else "🟠"

        text = (
            f"🚨 <b>CRITICAL EVENT</b> {sev_icon}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"⚠️ Severity: <b>{event.severity}/10</b>\n"
            f"📌 Category: <b>{cat}</b>\n"
            f"🌍 {flag} {country}\n"
            f"📡 Source: {source}\n\n"
            f"📝 {summary}\n"
        )

        if event.source_url:
            text += f'\n🔗 <a href="{event.source_url}">Source</a>'

        # Send with image if available
        if event.image_url and event.image_url.startswith("http"):
            await send_admin_photo(event.image_url, text)
        else:
            await send_admin_message(text)

        logger.info(f"🚨 Alert: critical event #{event.id} (sev={event.severity})")


async def _check_new_signals():
    """Alert on new high-confidence trading signals."""
    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.signal import Signal
    from app.telegram_bot.bot import send_admin_message

    since = datetime.now(timezone.utc) - timedelta(minutes=2)

    async with async_session() as db:
        result = await db.execute(
            select(Signal)
            .where(Signal.status == "active")
            .where(Signal.confidence >= 0.7)
            .where(Signal.created_at > since)
            .order_by(desc(Signal.created_at))
            .limit(5)
        )
        signals = result.scalars().all()

    for signal in signals:
        if signal.id in _alerted_signal_ids:
            continue

        _alerted_signal_ids.add(signal.id)
        _trim_set(_alerted_signal_ids)

        direction = str(signal.direction or "?")
        dir_icon = "📈" if "YES" in direction.upper() else "📉"

        text = (
            f"⚡ <b>NEW SIGNAL</b> {dir_icon}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📊 Type: <b>{signal.signal_type}</b>\n"
            f"🎯 Direction: <b>{direction}</b>\n"
            f"💰 Edge: <b>{signal.edge_pct:.1f}%</b>\n"
            f"📈 Confidence: <b>{signal.confidence:.0%}</b>\n"
        )

        if signal.reasoning:
            text += f"\n💡 {signal.reasoning[:200]}\n"

        await send_admin_message(text)
        logger.info(f"⚡ Alert: signal #{signal.id}")


async def _check_tension_spike():
    """Alert when tension level escalates."""
    global _last_tension_level

    from app.database import async_session
    from sqlalchemy import select, desc
    from app.models.tension import TensionHistory
    from app.telegram_bot.bot import send_admin_message

    async with async_session() as db:
        result = await db.execute(
            select(TensionHistory).order_by(desc(TensionHistory.calculated_at)).limit(1)
        )
        tension = result.scalar_one_or_none()

    if not tension:
        return

    current_level = tension.level

    if _last_tension_level is None:
        _last_tension_level = current_level
        return

    if current_level != _last_tension_level:
        old_level = _last_tension_level
        _last_tension_level = current_level

        levels = ["CALM", "GUARDED", "ELEVATED", "HIGH", "CRITICAL"]
        try:
            old_idx = levels.index(old_level)
            new_idx = levels.index(current_level)
        except ValueError:
            return

        if new_idx > old_idx:
            level_icons = {
                "CALM": "🟢", "GUARDED": "🟡", "ELEVATED": "🟠",
                "HIGH": "🔴", "CRITICAL": "⚫",
            }
            icon = level_icons.get(current_level, "⚪")
            bars = int(tension.score)
            bar_str = "█" * bars + "░" * (10 - bars)

            text = (
                f"🌡️ <b>TENSION SPIKE</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"  {old_level} → <b>{current_level}</b> {icon}\n"
                f"  [{bar_str}] <b>{tension.score:.1f}/10</b>\n"
            )

            if tension.breakdown:
                text += "\nFactors:\n"
                sorted_factors = sorted(
                    tension.breakdown.items(), key=lambda x: x[1], reverse=True
                )
                for factor, value in sorted_factors[:5]:
                    text += f"  • {factor}: {value:.2f}\n"

            await send_admin_message(text)
            logger.info(f"🌡️ Tension: {old_level} → {current_level}")


async def _check_source_failures():
    """Alert when a source hits max errors."""
    from app.ingestion.manager import IngestionManager
    from app.telegram_bot.bot import send_admin_message

    manager = IngestionManager()
    sources = manager.get_status()

    for s in sources:
        if not s["enabled"]:
            continue

        name = s["name"]

        if s["error_count"] >= 10 and name not in _alerted_source_errors:
            _alerted_source_errors.add(name)

            text = (
                f"🔴 <b>SOURCE FAILURE</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"📡 <b>{name}</b> disabled after 10 errors\n"
                f"  Last fetch: {s['last_fetch'] or 'never'}\n\n"
                f"💡 Use /restart {name} to re-enable"
            )

            await send_admin_message(text)
            logger.info(f"🔴 Source failure: {name}")

        elif s["error_count"] < 5 and name in _alerted_source_errors:
            _alerted_source_errors.discard(name)

            # Recovery notification
            text = f"🟢 <b>SOURCE RECOVERED</b>\n\n📡 <b>{name}</b> is back online"
            await send_admin_message(text)
            logger.info(f"🟢 Source recovered: {name}")


# ═══════════════════════════════════════════════════════════════════
# REAL-TIME EVENT PUSH (called from ingestion pipeline)
# ═══════════════════════════════════════════════════════════════════

async def push_event_alert(event_id: int, severity: int, category: str | None,
                           country: str | None, summary: str | None,
                           source: str | None, image_url: str | None = None,
                           source_url: str | None = None):
    """Called directly from the ingestion pipeline for instant alerts.
    Only fires for severity >= 8 events."""
    from app.telegram_bot.handlers.admin import are_alerts_enabled
    if not are_alerts_enabled():
        return

    if severity < 8:
        return

    if event_id in _alerted_event_ids:
        return

    _alerted_event_ids.add(event_id)
    _trim_set(_alerted_event_ids)

    from app.telegram_bot.bot import send_admin_message, send_admin_photo

    flag = _country_flag(country or "")
    sev_icon = "🔴" if severity >= 9 else "🟠"

    text = (
        f"🚨 <b>LIVE EVENT</b> {sev_icon}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"⚠️ Severity: <b>{severity}/10</b>\n"
        f"📌 {category or '?'} {flag} {country or ''}\n"
        f"📡 {source or '?'}\n\n"
        f"📝 {(summary or '')[:300]}\n"
    )

    if source_url:
        text += f'\n🔗 <a href="{source_url}">Source</a>'

    if image_url and image_url.startswith("http"):
        await send_admin_photo(image_url, text)
    else:
        await send_admin_message(text)

    logger.info(f"🚨 Live push: event #{event_id} sev={severity}")


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def _trim_set(s: set):
    if len(s) > _MAX_TRACKED:
        sorted_ids = sorted(s)
        for i in sorted_ids[:len(s) - _MAX_TRACKED]:
            s.discard(i)


def _country_flag(code: str) -> str:
    if not code or len(code) != 2:
        return "🌍"
    try:
        return chr(0x1F1E6 + ord(code[0].upper()) - ord("A")) + chr(0x1F1E6 + ord(code[1].upper()) - ord("A"))
    except Exception:
        return "🌍"
