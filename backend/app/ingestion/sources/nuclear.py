import logging
import httpx
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

SAFECAST_URL = "https://api.safecast.org/measurements.json"


class NuclearSource(BaseSource):
    name = "nuclear"
    interval = 3600  # 1 hour
    credibility = 7.0

    async def fetch(self) -> list[RawEvent]:
        events = []
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(SAFECAST_URL, params={
                    "order": "created_at+desc",
                    "per_page": "50",
                })
                resp.raise_for_status()
                data = resp.json()

                for measurement in data:
                    value = measurement.get("value")
                    unit = measurement.get("unit", "cpm")
                    lat = measurement.get("latitude")
                    lon = measurement.get("longitude")

                    if value is None or lat is None or lon is None:
                        continue

                    # Flag elevated readings (>100 CPM is notable, >1000 is alarming)
                    if value > 100:
                        severity = "elevated" if value < 500 else "HIGH" if value < 1000 else "CRITICAL"
                        events.append(RawEvent(
                            source="safecast",
                            text=f"Radiation reading {severity}: {value} {unit} at ({lat:.4f}, {lon:.4f})",
                            latitude=lat,
                            longitude=lon,
                            credibility=7.0,
                            metadata={"value": value, "unit": unit, "severity": severity},
                        ))
            except Exception as e:
                logger.warning(f"Safecast API failed: {e}")

        return events
