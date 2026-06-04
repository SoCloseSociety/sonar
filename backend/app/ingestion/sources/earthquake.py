import logging
import httpx
from datetime import datetime, timezone
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson"


class EarthquakeSource(BaseSource):
    name = "earthquake"
    interval = 60  # every minute
    credibility = 10.0

    async def fetch(self) -> list[RawEvent]:
        events = []
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(USGS_URL)
            resp.raise_for_status()
            data = resp.json()

            for feature in data.get("features", []):
                props = feature.get("properties", {})
                coords = feature.get("geometry", {}).get("coordinates", [])

                magnitude = props.get("mag", 0)
                place = props.get("place", "Unknown")
                time_ms = props.get("time", 0)
                tsunami = props.get("tsunami", 0)
                url = props.get("url", "")

                if len(coords) < 2:
                    continue

                severity_text = "minor"
                if magnitude >= 7:
                    severity_text = "CRITICAL"
                elif magnitude >= 6:
                    severity_text = "major"
                elif magnitude >= 5:
                    severity_text = "significant"
                elif magnitude >= 4:
                    severity_text = "moderate"

                text = f"Earthquake M{magnitude:.1f} — {place} ({severity_text})"
                if tsunami:
                    text += " [TSUNAMI WARNING]"

                events.append(RawEvent(
                    source="usgs_earthquake",
                    text=text,
                    url=url,
                    latitude=coords[1],
                    longitude=coords[0],
                    timestamp=datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc),
                    credibility=10.0,
                    metadata={"magnitude": magnitude, "depth_km": coords[2] if len(coords) > 2 else None, "tsunami": bool(tsunami)},
                ))

        return events
