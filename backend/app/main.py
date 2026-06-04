import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import init_db, close_db
from app.redis_client import get_redis, close_redis
from app.websocket import sio_app
from app.logging_config import setup_logging

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging("INFO")
    logger.info(f"Starting {settings.app_name}...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Initialize Redis
    await get_redis()
    logger.info("Redis connected")

    # Start background services
    from app.ingestion.manager import IngestionManager
    from app.polymarket.market_tracker import MarketTracker
    from app.analyzer.tension_index import TensionCalculator

    ingestion = IngestionManager()
    market_tracker = MarketTracker()
    tension_calc = TensionCalculator()

    # Store reference for API access
    app.state.ingestion_manager = ingestion

    tasks = []
    if settings.enable_polymarket:
        tasks.append(asyncio.create_task(market_tracker.run()))
    tasks.append(asyncio.create_task(ingestion.run()))
    tasks.append(asyncio.create_task(tension_calc.run()))

    # Start Telegram bot if configured
    if settings.enable_telegram_bot and settings.telegram_bot_token:
        from app.telegram_bot.bot import start_bot
        tasks.append(asyncio.create_task(start_bot()))

    logger.info(f"Background services started ({len(tasks)} tasks)")

    yield

    # Shutdown with timeout to prevent hanging
    logger.info("Shutting down...")
    for task in tasks:
        task.cancel()
    try:
        await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=15,
        )
    except asyncio.TimeoutError:
        logger.warning("Some background tasks did not stop within 15s — forcing shutdown")
    await close_redis()
    await close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="SONAR Intelligence Terminal",
    description="Real-time geopolitical intelligence platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — explicit origins (wildcard + credentials is a security violation)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# Mount Socket.IO
app.mount("/socket.io", sio_app)

# Serve static data files (GeoJSON, config JSONs)
# In Docker: /app/data (volume mount), locally: ../../data relative to this file
import os
_data_candidates = ["/app/data", os.path.normpath(os.path.join(os.path.dirname(__file__), "../../data"))]
for _data_dir in _data_candidates:
    if os.path.isdir(_data_dir):
        app.mount("/data", StaticFiles(directory=_data_dir), name="static-data")
        break

# Include API routers
from app.auth.router import router as auth_router
from app.api.events import router as events_router
from app.api.markets import router as markets_router
from app.api.signals import router as signals_router
from app.api.map_data import router as map_router
from app.api.tracking import router as tracking_router
from app.api.dashboard import router as dashboard_router
from app.api.settings import router as settings_router
from app.api.trading import router as trading_router
from app.api.intel import router as intel_router
from app.api.analysis import router as analysis_router

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(events_router, prefix="/api/events", tags=["events"])
app.include_router(markets_router, prefix="/api/markets", tags=["markets"])
app.include_router(signals_router, prefix="/api/signals", tags=["signals"])
app.include_router(map_router, prefix="/api/map", tags=["map"])
app.include_router(tracking_router, prefix="/api/tracking", tags=["tracking"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(trading_router, prefix="/api/trading", tags=["trading"])
app.include_router(intel_router, prefix="/api", tags=["intel"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["analysis"])


@app.get("/health")
async def health_check():
    redis_ok = False
    try:
        r = await get_redis()
        await r.ping()
        redis_ok = True
    except Exception:
        pass
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": "1.0.0",
        "redis": "connected" if redis_ok else "disconnected",
    }
