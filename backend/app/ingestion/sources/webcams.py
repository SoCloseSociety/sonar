import logging
import json
import os
import math
import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings
from app.redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)
settings = get_settings()

WINDY_API_URL = "https://api.windy.com/webcams/api/v3/webcams"

PROXIMITY_RADIUS_KM = 100


class WebcamSource(BaseSource):
    name = "webcams"
    interval = 1800  # 30 min
    credibility = 4.0

    async def fetch(self) -> list[RawEvent]:
        """Fetch and cache webcam data from Windy API + static list."""
        webcams = []

        # 1. Always load static curated webcams (no API needed)
        static = _load_static_webcams()
        webcams.extend(static)

        # 2. Fetch from Windy Webcams API if key configured
        if settings.windy_webcams_api_key:
            try:
                api_cams = await self._fetch_windy_webcams()
                webcams.extend(api_cams)
                logger.info(f"Windy API returned {len(api_cams)} webcams")
            except Exception as e:
                logger.warning(f"Windy API fetch failed: {e}")

        # Deduplicate by coordinates (~111m precision)
        seen = set()
        unique = []
        for cam in webcams:
            key = (round(cam["lat"], 3), round(cam["lon"], 3))
            if key not in seen:
                seen.add(key)
                unique.append(cam)

        # Cache for the API to serve
        await cache_set("webcams:all", json.dumps(unique), ttl=3600)
        logger.info(f"Cached {len(unique)} unique webcams")

        return []  # Webcams don't generate events directly

    async def _fetch_windy_webcams(self) -> list[dict]:
        """Fetch webcams from Windy API v3 across geopolitical hotspots."""
        cams = []
        headers = {"x-windy-api-key": settings.windy_webcams_api_key}

        # Strategic regions — centers + 250km radius
        regions = [
            ("Middle East", 27, 44),
            ("Eastern Europe / Ukraine", 49, 33),
            ("Taiwan Strait", 24, 119),
            ("Korean Peninsula", 37, 127),
            ("Horn of Africa", 5, 42),
            ("South China Sea", 12, 112),
            ("Strait of Hormuz", 26, 56),
            ("Suez Canal", 30, 32),
            ("Strait of Malacca", 2, 101),
            ("US East Coast", 39, -77),
            ("US West Coast", 37, -122),
            ("Western Europe", 48, 2),
            ("Caucasus", 42, 44),
            ("Central Asia", 41, 69),
            ("South America", -23, -43),
            ("India / Pakistan", 28, 77),
            ("Sahel", 14, 2),
            ("Baltic", 57, 24),
            ("Arctic / Svalbard", 78, 16),
        ]

        async with httpx.AsyncClient(timeout=15) as client:
            for name, lat, lon in regions:
                try:
                    params = {
                        "nearby": f"{lat},{lon},250",
                        "limit": 50,
                        "include": "location,images,urls",
                    }
                    resp = await client.get(WINDY_API_URL, headers=headers, params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        for wc in data.get("webcams", []):
                            loc = wc.get("location", {})
                            images = wc.get("images", {})
                            urls = wc.get("urls", {})

                            thumbnail = ""
                            if images.get("current"):
                                thumbnail = images["current"].get("thumbnail", "")
                            elif images.get("daylight"):
                                thumbnail = images["daylight"].get("thumbnail", "")

                            player_url = urls.get("detail", "")
                            webcam_id = wc.get("webcamId", "")
                            # Windy public embed player — embeddable without API key
                            embed_url = (
                                f"https://webcams.windy.com/webcams/public/embed/player/{webcam_id}/day"
                                if webcam_id else ""
                            )

                            cams.append({
                                "id": f"windy-{webcam_id}",
                                "name": wc.get("title", "Unknown"),
                                "lat": loc.get("latitude", 0),
                                "lon": loc.get("longitude", 0),
                                "country": loc.get("country", ""),
                                "city": loc.get("city", ""),
                                "thumbnail": thumbnail,
                                "player_url": player_url,
                                "embed_url": embed_url,
                                "source": "windy",
                                "status": wc.get("status", "unknown"),
                                "type": "live",
                            })
                    elif resp.status_code == 401:
                        logger.error("Windy API key invalid")
                        break
                    else:
                        logger.debug(f"Windy API {name}: HTTP {resp.status_code}")
                except Exception as e:
                    logger.debug(f"Windy API {name} failed: {e}")

        return cams


def _load_static_webcams() -> list[dict]:
    """Load the expanded static webcam database."""
    try:
        data_path = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "../../../../data/webcam_feeds.json")
        )
        if os.path.exists(data_path):
            with open(data_path) as f:
                raw = json.load(f)
            return [
                {
                    "id": f"static-{i}",
                    "name": cam.get("name", ""),
                    "lat": cam["lat"],
                    "lon": cam["lon"],
                    "country": cam.get("country", ""),
                    "city": cam.get("city", ""),
                    "thumbnail": cam.get("thumbnail", ""),
                    "player_url": cam.get("url", ""),
                    "embed_url": cam.get("embed_url", ""),
                    "source": "static",
                    "status": "active" if cam.get("url") else "no_stream",
                    "type": cam.get("type", "city"),
                }
                for i, cam in enumerate(raw)
            ]
    except Exception as e:
        logger.debug(f"Static webcam load failed: {e}")
    return []


async def get_cached_webcams() -> list[dict]:
    """Get all cached webcams (called from API endpoints)."""
    cached = await cache_get("webcams:all")
    if cached:
        return json.loads(cached)
    return _load_static_webcams()


async def find_webcams_near(lat: float, lon: float, radius_km: float = PROXIMITY_RADIUS_KM) -> list[dict]:
    """Find webcams within radius_km of a lat/lon point."""
    all_cams = await get_cached_webcams()
    nearby = []
    for cam in all_cams:
        dist = _haversine(lat, lon, cam["lat"], cam["lon"])
        if dist <= radius_km:
            cam_copy = dict(cam)
            cam_copy["distance_km"] = round(dist, 1)
            nearby.append(cam_copy)
    nearby.sort(key=lambda c: c["distance_km"])
    return nearby


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
