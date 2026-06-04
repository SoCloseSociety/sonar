import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)


class BaseSource(ABC):
    """Abstract base class for all data sources."""

    name: str = "unknown"
    enabled: bool = True
    interval: int = 120  # seconds between scans
    credibility: float = 5.0

    def __init__(self):
        self._last_fetch: datetime | None = None
        self._error_count: int = 0
        self._max_errors: int = 10
        self._backoff: int = 0
        self._disabled_at: datetime | None = None
        self._retry_after: int = 300  # auto-retry 5 min after disable

    @abstractmethod
    async def fetch(self) -> list[RawEvent]:
        """Fetch new events from this source. Must be implemented by subclasses."""
        ...

    async def safe_fetch(self) -> list[RawEvent]:
        """Fetch with error isolation — never lets a source crash the system."""
        if not self.enabled:
            return []

        if self._error_count >= self._max_errors:
            # Auto-retry after cooldown period
            if self._disabled_at:
                elapsed = (datetime.now(timezone.utc) - self._disabled_at).total_seconds()
                if elapsed >= self._retry_after:
                    logger.info(f"Source {self.name}: retrying after {self._retry_after}s cooldown")
                    self._error_count = 0
                    self._disabled_at = None
                else:
                    return []
            else:
                self._disabled_at = datetime.now(timezone.utc)
                logger.warning(f"Source {self.name} disabled after {self._max_errors} errors, will retry in {self._retry_after}s")
                return []

        try:
            events = await asyncio.wait_for(self.fetch(), timeout=60)
            self._error_count = 0
            self._backoff = 0
            self._last_fetch = datetime.now(timezone.utc)
            logger.debug(f"Source {self.name}: fetched {len(events)} events")
            return events
        except asyncio.TimeoutError:
            self._error_count += 1
            logger.warning(f"Source {self.name} timed out (errors: {self._error_count})")
            return []
        except Exception as e:
            self._error_count += 1
            self._backoff = min(self._backoff + 30, 300)
            logger.error(f"Source {self.name} error: {e} (errors: {self._error_count})")
            return []

    @property
    def status(self) -> dict:
        if not self.enabled:
            st = "disabled"
        elif self._error_count >= self._max_errors:
            st = "error"
        elif self._last_fetch is not None:
            st = "active"
        else:
            st = "idle"

        return {
            "name": self.name,
            "status": st,
            "enabled": self.enabled,
            "last_fetch": self._last_fetch.isoformat() if self._last_fetch else None,
            "error_count": self._error_count,
            "healthy": self._error_count < self._max_errors,
            "interval": self.interval,
        }
