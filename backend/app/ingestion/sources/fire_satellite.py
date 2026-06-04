import logging
import httpx
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


class FireSatelliteSource(BaseSource):
    name = "fire_satellite"
    interval = 10800  # 3 hours
    credibility = 9.0

    async def fetch(self) -> list[RawEvent]:
        if not settings.nasa_firms_map_key:
            logger.debug("NASA FIRMS API key not configured, skipping")
            return []

        events = []
        url = f"{FIRMS_URL}/{settings.nasa_firms_map_key}/VIIRS_SNPP_NRT/world/1"

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            resp.raise_for_status()

            lines = resp.text.strip().split("\n")
            if len(lines) < 2:
                return []

            headers = lines[0].split(",")

            # Only report high-confidence fire clusters
            fire_clusters: dict[str, list] = {}
            for line in lines[1:]:
                cols = line.split(",")
                if len(cols) < 10:
                    continue

                try:
                    lat = float(cols[0])
                    lon = float(cols[1])
                    brightness = float(cols[2]) if cols[2] else 0
                    confidence = cols[8] if len(cols) > 8 else ""

                    if confidence.lower() not in ("high", "h", "nominal", "n"):
                        continue

                    # Cluster by 0.5-degree grid
                    grid_key = f"{round(lat * 2) / 2:.1f},{round(lon * 2) / 2:.1f}"
                    if grid_key not in fire_clusters:
                        fire_clusters[grid_key] = []
                    fire_clusters[grid_key].append({"lat": lat, "lon": lon, "brightness": brightness})
                except (ValueError, IndexError):
                    continue

            # Report clusters with 3+ detections
            for grid_key, detections in fire_clusters.items():
                if len(detections) < 3:
                    continue

                avg_lat = sum(d["lat"] for d in detections) / len(detections)
                avg_lon = sum(d["lon"] for d in detections) / len(detections)
                max_brightness = max(d["brightness"] for d in detections)

                events.append(RawEvent(
                    source="nasa_firms",
                    text=f"Active fire cluster detected: {len(detections)} hotspots near ({avg_lat:.2f}, {avg_lon:.2f}), peak brightness {max_brightness:.0f}K",
                    latitude=avg_lat,
                    longitude=avg_lon,
                    credibility=9.0,
                    metadata={"hotspot_count": len(detections), "max_brightness": max_brightness},
                ))

        return events
