import asyncio
import logging
from telegram import BotCommand, Update
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, filters, ContextTypes,
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global bot application reference (for sending alerts from outside)
_bot_app: Application | None = None


def get_bot_app() -> Application | None:
    return _bot_app


def is_admin(update: Update) -> bool:
    """Check if the user is the configured admin."""
    if not settings.telegram_admin_chat_id:
        return False
    return str(update.effective_user.id) == settings.telegram_admin_chat_id


async def admin_only(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Middleware: reject non-admin users. Returns True if authorized."""
    if is_admin(update):
        return True
    # Show chat_id so the admin can configure it
    await update.message.reply_text(
        f"⛔ Unauthorized.\n\n"
        f"Your Chat ID: <code>{update.effective_user.id}</code>\n"
        f"Set <code>TELEGRAM_ADMIN_CHAT_ID={update.effective_user.id}</code> in .env to authorize.",
        parse_mode="HTML",
    )
    return False


async def send_admin_message(text: str, parse_mode: str = "HTML", photo_url: str | None = None):
    """Send a message to the admin chat. Used by the alerting system.
    If photo_url is set, sends photo with caption instead of text."""
    app = get_bot_app()
    if not app or not settings.telegram_admin_chat_id:
        return
    try:
        if photo_url:
            await app.bot.send_photo(
                chat_id=settings.telegram_admin_chat_id,
                photo=photo_url,
                caption=text[:1024],  # Telegram caption limit
                parse_mode=parse_mode,
            )
        else:
            await app.bot.send_message(
                chat_id=settings.telegram_admin_chat_id,
                text=text,
                parse_mode=parse_mode,
                disable_web_page_preview=True,
            )
    except Exception as e:
        logger.error(f"Failed to send admin message: {e}")


async def send_admin_photo(photo_url: str, caption: str = "", parse_mode: str = "HTML"):
    """Send a photo to the admin chat."""
    app = get_bot_app()
    if not app or not settings.telegram_admin_chat_id:
        return
    try:
        await app.bot.send_photo(
            chat_id=settings.telegram_admin_chat_id,
            photo=photo_url,
            caption=caption[:1024] if caption else "",
            parse_mode=parse_mode,
        )
    except Exception as e:
        logger.error(f"Failed to send admin photo: {e}")


async def start_bot():
    """Initialize and start the Telegram bot with all handlers."""
    global _bot_app

    if not settings.telegram_bot_token:
        logger.warning("Telegram bot token not configured, skipping bot startup")
        return

    app = Application.builder().token(settings.telegram_bot_token).build()
    _bot_app = app

    # Import handlers
    from app.telegram_bot.handlers.commands import (
        cmd_start, cmd_status, cmd_markets, cmd_hot,
        cmd_signals, cmd_tension, cmd_flights, cmd_vessels, cmd_help,
    )
    from app.telegram_bot.handlers.admin import (
        cmd_sources, cmd_toggle, cmd_scan, cmd_db,
        cmd_critical, cmd_events_summary, cmd_alerts_toggle,
        cmd_broadcast, cmd_logs, cmd_config, cmd_uptime,
        cmd_search, cmd_watch, cmd_unwatch, cmd_watchlist,
        cmd_restart, cmd_purge, cmd_stats, cmd_digest,
        cmd_top, cmd_market,
    )
    from app.telegram_bot.handlers.callbacks import handle_callback

    # --- Intelligence commands ---
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("markets", cmd_markets))
    app.add_handler(CommandHandler("hot", cmd_hot))
    app.add_handler(CommandHandler("signals", cmd_signals))
    app.add_handler(CommandHandler("tension", cmd_tension))
    app.add_handler(CommandHandler("flights", cmd_flights))
    app.add_handler(CommandHandler("vessels", cmd_vessels))

    # --- Admin commands ---
    app.add_handler(CommandHandler("sources", cmd_sources))
    app.add_handler(CommandHandler("toggle", cmd_toggle))
    app.add_handler(CommandHandler("scan", cmd_scan))
    app.add_handler(CommandHandler("db", cmd_db))
    app.add_handler(CommandHandler("critical", cmd_critical))
    app.add_handler(CommandHandler("events", cmd_events_summary))
    app.add_handler(CommandHandler("alerts", cmd_alerts_toggle))
    app.add_handler(CommandHandler("broadcast", cmd_broadcast))
    app.add_handler(CommandHandler("logs", cmd_logs))
    app.add_handler(CommandHandler("config", cmd_config))
    app.add_handler(CommandHandler("uptime", cmd_uptime))

    # --- New v2 commands ---
    app.add_handler(CommandHandler("search", cmd_search))
    app.add_handler(CommandHandler("watch", cmd_watch))
    app.add_handler(CommandHandler("unwatch", cmd_unwatch))
    app.add_handler(CommandHandler("watchlist", cmd_watchlist))
    app.add_handler(CommandHandler("restart", cmd_restart))
    app.add_handler(CommandHandler("purge", cmd_purge))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("digest", cmd_digest))
    app.add_handler(CommandHandler("top", cmd_top))
    app.add_handler(CommandHandler("market", cmd_market))

    # --- Callback queries (inline buttons) ---
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Set bot commands menu
    await app.initialize()
    try:
        await app.bot.set_my_commands([
            BotCommand("start", "🏠 Welcome & info"),
            BotCommand("status", "📊 System health overview"),
            BotCommand("sources", "📡 Data source status"),
            BotCommand("events", "📰 Events summary"),
            BotCommand("critical", "🚨 Critical events"),
            BotCommand("search", "🔍 Search events"),
            BotCommand("top", "🏆 Top events by severity"),
            BotCommand("markets", "💹 Top Polymarket markets"),
            BotCommand("market", "📈 Market detail by ID"),
            BotCommand("hot", "🔥 Biggest price movers"),
            BotCommand("signals", "⚡ Active trading signals"),
            BotCommand("tension", "🌡️ Global tension index"),
            BotCommand("flights", "✈️ Military flights"),
            BotCommand("vessels", "🚢 Naval movements"),
            BotCommand("stats", "📉 Event rate statistics"),
            BotCommand("digest", "📋 Daily intelligence digest"),
            BotCommand("watch", "👁️ Watch keyword/market"),
            BotCommand("watchlist", "📝 View watchlist"),
            BotCommand("toggle", "🔧 Toggle source on/off"),
            BotCommand("scan", "🔄 Force scan a source"),
            BotCommand("restart", "♻️ Restart a source"),
            BotCommand("db", "🗄️ Database statistics"),
            BotCommand("alerts", "🔔 Toggle auto-alerts"),
            BotCommand("logs", "📋 Recent error logs"),
            BotCommand("config", "⚙️ View configuration"),
            BotCommand("uptime", "⏱️ System uptime"),
            BotCommand("purge", "🗑️ Purge old data"),
            BotCommand("broadcast", "📢 Send WebSocket broadcast"),
            BotCommand("help", "❓ Full command reference"),
        ])
    except Exception as e:
        logger.warning(f"Could not set bot commands menu: {e}")

    logger.info("🤖 Telegram bot starting (polling)...")
    await app.start()
    await app.updater.start_polling(drop_pending_updates=True)
    logger.info("✅ Telegram bot is running")

    # Start background tasks
    from app.telegram_bot.handlers.alerts import alert_loop, digest_scheduler, watchlist_checker
    asyncio.create_task(alert_loop())
    asyncio.create_task(digest_scheduler())
    asyncio.create_task(watchlist_checker())
