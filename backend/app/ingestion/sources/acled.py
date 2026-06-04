"""ACLED (Armed Conflict Location & Event Data) — real conflict event tracking."""
import logging
from datetime import datetime, timezone, timedelta

import httpx

from app.config import get_settings
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)
settings = get_settings()

# ACLED event type severity mapping
SEVERITY_MAP = {
    "Battles": 8,
    "Explosions/Remote violence": 9,
    "Violence against civilians": 8,
    "Riots": 6,
    "Protests": 4,
    "Strategic developments": 5,
}


class ACLEDSource(BaseSource):
    """
    ACLED conflict event data — the gold standard for conflict tracking.
    Free API (email/key registration at acleddata.com).
    Tracks: battles, explosions, violence, riots, protests, strategic dev.
    """

    name = "acled"
    interval = 1800  # 30 minutes (ACLED updates daily, but we check periodically)
    credibility = 9.0  # Academic-grade data

    def __init__(self):
        super().__init__()
        self._seen_ids: set[str] = set()
        self._client = httpx.AsyncClient(timeout=30, follow_redirects=True)

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []

        if not settings.acled_api_key or not settings.acled_email:
            return events

        # Fetch last 7 days of conflict data
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        api_url = "https://api.acleddata.com/acled/read"

        try:
            resp = await self._client.get(api_url, params={
                "key": settings.acled_api_key,
                "email": settings.acled_email,
                "event_date": f"{since}|{datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
                "event_date_where": "BETWEEN",
                "limit": 100,
                "fields": "event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|"
                          "country|admin1|admin2|location|latitude|longitude|fatalities|notes",
            })
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("data", []):
                event_id = item.get("event_id_cnty", "")
                if event_id in self._seen_ids:
                    continue
                self._seen_ids.add(event_id)

                event_type = item.get("event_type", "")
                sub_type = item.get("sub_event_type", "")
                actor1 = item.get("actor1", "")
                actor2 = item.get("actor2", "")
                country = item.get("country", "")
                location = item.get("location", "")
                admin1 = item.get("admin1", "")
                fatalities = int(item.get("fatalities", 0) or 0)
                notes = item.get("notes", "")[:500]
                event_date = item.get("event_date", "")

                lat = _safe_float(item.get("latitude"))
                lon = _safe_float(item.get("longitude"))

                # Build descriptive text
                actors = f"{actor1} vs {actor2}" if actor2 else actor1
                loc_str = f"{location}, {admin1}, {country}" if admin1 else f"{location}, {country}"
                text = f"[ACLED/{event_type}] {sub_type}: {actors} in {loc_str}"
                if fatalities > 0:
                    text += f" — {fatalities} fatalities"
                if notes:
                    text += f"\n{notes}"

                # Parse date
                timestamp = datetime.now(timezone.utc)
                if event_date:
                    try:
                        timestamp = datetime.strptime(event_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

                events.append(RawEvent(
                    source="acled",
                    text=text,
                    latitude=lat,
                    longitude=lon,
                    country=country,
                    timestamp=timestamp,
                    credibility=self.credibility,
                    metadata={
                        "event_type": event_type,
                        "sub_type": sub_type,
                        "actor1": actor1,
                        "actor2": actor2,
                        "fatalities": fatalities,
                        "event_id": event_id,
                    },
                ))

        except Exception as e:
            logger.error(f"ACLED fetch error: {e}")

        # Keep memory bounded
        if len(self._seen_ids) > 5000:
            self._seen_ids = set(list(self._seen_ids)[-2000:])

        return events


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return f if -90 <= f <= 90 or -180 <= f <= 180 else None
    except (TypeError, ValueError):
        return None
