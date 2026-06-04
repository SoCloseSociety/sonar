import hashlib
import logging
from app.redis_client import set_exists, set_add

logger = logging.getLogger(__name__)


def compute_hash(text: str) -> str:
    normalized = " ".join(text.strip().lower().split())
    return hashlib.sha256(normalized.encode()).hexdigest()


async def is_duplicate(text: str) -> bool:
    text_hash = compute_hash(text)
    if await set_exists("event_hashes", text_hash):
        return True
    await set_add("event_hashes", text_hash, ttl=21600)  # 6 hours
    return False
