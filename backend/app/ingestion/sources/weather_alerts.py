import logging
import httpx
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

NOAA_ALERTS_URL = "https://api.weather.gov/alerts/active"


class WeatherAlertSource(BaseSource):
    name = "weather"
    interval = 300
    credibility = 9.0

    async def fetch(self) -> list[RawEvent]:
        events = []
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "SONAR/1.0"}) as client:
            resp = await client.get(NOAA_ALERTS_URL, params={"status": "actual", "severity": "Severe,Extreme"})
            resp.raise_for_status()
            data = resp.json()

            for feature in data.get("features", [])[:20]:
                props = feature.get("properties", {})
                event_name = props.get("event", "")
                headline = props.get("headline", "")
                severity = props.get("severity", "")
                area = props.get("areaDesc", "")

                text = f"Weather Alert: {event_name} — {headline}"

                # Try to get centroid from geometry
                geom = feature.get("geometry")
                lat, lon = None, None
                if geom and geom.get("type") == "Point":
                    coords = geom.get("coordinates", [])
                    if len(coords) >= 2:
                        lon, lat = coords[0], coords[1]

                events.append(RawEvent(
                    source="noaa_weather",
                    text=text,
                    latitude=lat,
                    longitude=lon,
                    country="US",
                    credibility=9.0,
                    metadata={"severity": severity, "area": area, "event_type": event_name},
                ))

        return events
