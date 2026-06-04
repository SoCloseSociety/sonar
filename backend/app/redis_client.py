import redis.asyncio as aioredis
from app.config import get_settings

settings = get_settings()

redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global redis_pool
    if redis_pool is None:
        redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
            socket_connect_timeout=5,
            socket_timeout=10,
            health_check_interval=30,
        )
    return redis_pool


async def close_redis():
    global redis_pool
    if redis_pool:
        await redis_pool.close()
        redis_pool = None


async def publish(channel: str, message: str):
    r = await get_redis()
    await r.publish(channel, message)


async def cache_get(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl: int = 300):
    r = await get_redis()
    await r.set(key, value, ex=ttl)


async def set_add(key: str, value: str, ttl: int = 21600):
    r = await get_redis()
    await r.sadd(key, value)
    await r.expire(key, ttl)


async def set_exists(key: str, value: str) -> bool:
    r = await get_redis()
    return await r.sismember(key, value)
