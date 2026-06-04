from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=40,
    max_overflow=30,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=30,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    import asyncio
    import logging
    from sqlalchemy import text
    _log = logging.getLogger(__name__)

    # Retry connection up to 15 times (Postgres may still be starting)
    for attempt in range(15):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            _log.info("Database connection established")
            break
        except Exception as exc:
            if attempt < 14:
                _log.warning(f"Database not ready (attempt {attempt + 1}/15): {exc}")
                await asyncio.sleep(2)
            else:
                raise

    # Ensure PostGIS extension
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    _log.info("Database tables ready")


async def close_db():
    await engine.dispose()
