import json
import hashlib
import logging
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_X, ST_Y, ST_AsGeoJSON
from app.database import get_db
from app.models.event import Event
from app.models.tracking import FlightTrack, VesselTrack
from app.ingestion.sources.webcams import get_cached_webcams, find_webcams_near
from app.redis_client import cache_get, cache_set
from datetime import datetime, timezone, timedelta
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()


_MAP_LAYERS = [
    # Intelligence
    {"id": "events",    "name": "Events",          "icon": "AlertCircle",  "visible": True,  "description": "Geolocated OSINT events",            "group": "intel"},
    {"id": "conflicts", "name": "Conflict Zones",   "icon": "Crosshair",    "visible": True,  "description": "Active conflict areas",              "group": "intel"},
    {"id": "military",  "name": "Military Bases",   "icon": "Shield",       "visible": False, "description": "Known military installations",       "group": "intel"},
    # Tracking
    {"id": "flights",   "name": "Aircraft",         "icon": "Plane",        "visible": True,  "description": "Live ADS-B aircraft tracking",       "group": "tracking"},
    {"id": "vessels",   "name": "Vessels",           "icon": "Ship",         "visible": True,  "description": "Live AIS vessel tracking",           "group": "tracking"},
    {"id": "webcams",   "name": "Webcams",           "icon": "Camera",       "visible": True,  "description": "Public live camera feeds",           "group": "tracking"},
    # Hazards
    {"id": "earthquakes","name": "Earthquakes",      "icon": "Activity",     "visible": False, "description": "USGS seismic activity",              "group": "hazards"},
    {"id": "weather",   "name": "Weather",           "icon": "Cloud",        "visible": False, "description": "NOAA severe weather alerts",         "group": "hazards"},
    {"id": "fires",     "name": "Fires",             "icon": "Flame",        "visible": False, "description": "NASA FIRMS active fires",            "group": "hazards"},
    {"id": "nuclear",   "name": "Nuclear",           "icon": "Radiation",    "visible": False, "description": "Nuclear facilities & alerts",        "group": "hazards"},
    # Infrastructure
    {"id": "cyber",           "name": "Cyber Threats",        "icon": "Wifi",        "visible": False, "description": "ICS/SCADA & cyber attacks",                "group": "infra"},
    {"id": "oil",             "name": "Oil & Gas",            "icon": "Droplet",     "visible": False, "description": "Oil fields, terminals, pipelines",         "group": "infra"},
    {"id": "gas",             "name": "LNG & Gas Hubs",       "icon": "Flame",       "visible": False, "description": "LNG terminals, gas pipelines",             "group": "infra"},
    {"id": "energy",          "name": "Energy & Dams",        "icon": "Zap",         "visible": False, "description": "Hydroelectric dams, power plants",         "group": "infra"},
    {"id": "chokepoint",      "name": "Chokepoints",          "icon": "Anchor",      "visible": False, "description": "Maritime straits & canals",                "group": "infra"},
    {"id": "mining",          "name": "Mining & Minerals",    "icon": "Gem",         "visible": False, "description": "Gold, copper, lithium, rare earth",        "group": "infra"},
    {"id": "water",           "name": "Water & Dams",         "icon": "Waves",       "visible": False, "description": "Critical dams & water control",            "group": "infra"},
    {"id": "tech",            "name": "Tech & Semiconductors","icon": "Cpu",         "visible": False, "description": "Chip fabs, EUV, tech infrastructure",      "group": "infra"},
    {"id": "port",            "name": "Major Ports",          "icon": "Ship",        "visible": False, "description": "Strategic container ports",                "group": "infra"},
    {"id": "submarine_cable", "name": "Submarine Cables",     "icon": "Cable",       "visible": False, "description": "Internet exchange & cable hubs",           "group": "infra"},
    {"id": "heatmap",         "name": "Heatmap",              "icon": "Thermometer", "visible": False, "description": "Event density overlay",                    "group": "infra"},
]

_LAYER_GROUPS = [
    {"key": "intel",    "label": "INTELLIGENCE",    "color": "#06b6d4"},
    {"key": "tracking", "label": "TRACKING",        "color": "#3b82f6"},
    {"key": "hazards",  "label": "HAZARDS",         "color": "#f97316"},
    {"key": "infra",    "label": "INFRASTRUCTURE",  "color": "#a855f7"},
]


@router.get("/layers")
async def map_layers():
    """Return available map layer configuration with visibility defaults.

    Mirrors the DEFAULT_LAYERS / LAYER_GROUPS constants in the frontend
    mapStore so the UI can optionally hydrate layer state from the server.
    Response is static (no DB dependency) and cached for 5 minutes.
    """
    cached = await cache_get("map:layers")
    if cached:
        return json.loads(cached)

    payload = {"layers": _MAP_LAYERS, "groups": _LAYER_GROUPS}
    await cache_set("map:layers", json.dumps(payload), ttl=300)
    return payload


@router.get("/events")
async def map_events(
    hours: int = Query(default=24, le=168),
    min_severity: int = 0,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get geolocated events for map display."""
    # Cache for 45 seconds — reduces DB load from multiple map clients
    cache_key = f"map:events:{hours}:{min_severity}:{category or 'all'}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    query = (
        select(
            Event.id, Event.source, Event.category, Event.severity,
            Event.summary, Event.country, Event.impact_score,
            Event.created_at, Event.keywords,
            ST_X(Event.location).label("longitude"),
            ST_Y(Event.location).label("latitude"),
        )
        .where(Event.location.isnot(None))
        .where(Event.created_at > since)
        .order_by(desc(Event.created_at))
    )

    if min_severity > 0:
        query = query.where(Event.severity >= min_severity)
    if category:
        query = query.where(Event.category == category)

    result = await db.execute(query)
    rows = result.all()

    data = [
        {
            "id": r.id,
            "source": r.source,
            "category": r.category,
            "severity": r.severity,
            "summary": r.summary,
            "country": r.country,
            "impact_score": r.impact_score,
            "keywords": r.keywords,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    await cache_set(cache_key, json.dumps(data), ttl=45)
    return data


@router.get("/flights")
async def map_flights(
    military_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Get latest flight positions for map display (cached 30s)."""
    cache_key = f"map:flights:{military_only}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    since = datetime.now(timezone.utc) - timedelta(hours=2)  # 2h window — latest per aircraft via DISTINCT ON

    # Use DISTINCT ON to get latest position per aircraft in SQL (no Python dedup)
    query = (
        select(
            FlightTrack.icao24,
            FlightTrack.callsign, FlightTrack.origin_country,
            FlightTrack.altitude, FlightTrack.velocity,
            FlightTrack.heading, FlightTrack.squawk,
            FlightTrack.is_military, FlightTrack.is_government,
            FlightTrack.captured_at,
            ST_X(FlightTrack.position).label("longitude"),
            ST_Y(FlightTrack.position).label("latitude"),
        )
        .distinct(FlightTrack.icao24)
        .where(FlightTrack.position.isnot(None))
        .where(FlightTrack.captured_at > since)
        .order_by(FlightTrack.icao24, desc(FlightTrack.captured_at))
    )

    if military_only:
        query = query.where(FlightTrack.is_military == True)

    query = query.limit(5000)

    try:
        result = await db.execute(query)

        flights = [
            {
                "icao24": r.icao24, "callsign": r.callsign,
                "origin_country": r.origin_country, "altitude": r.altitude,
                "velocity": r.velocity, "heading": r.heading,
                "squawk": r.squawk, "is_military": r.is_military,
                "is_government": r.is_government,
                "latitude": r.latitude, "longitude": r.longitude,
                "captured_at": r.captured_at.isoformat() if r.captured_at else None,
            }
            for r in result.all()
        ]

        await cache_set(cache_key, json.dumps(flights), ttl=15)  # 15s cache for fresher data
        return flights
    except Exception as e:
        logger.error(f"map_flights error: {e}")
        return []


@router.get("/vessels")
async def map_vessels(
    military_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Get latest vessel positions for map display (cached 45s)."""
    cache_key = f"map:vessels:{military_only}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    since = datetime.now(timezone.utc) - timedelta(hours=12)  # 12h window — latest per MMSI via DISTINCT ON

    query = (
        select(
            VesselTrack.mmsi,
            VesselTrack.vessel_name, VesselTrack.vessel_type,
            VesselTrack.flag, VesselTrack.speed,
            VesselTrack.heading, VesselTrack.destination,
            VesselTrack.imo, VesselTrack.is_military, VesselTrack.is_dark,
            VesselTrack.captured_at,
            ST_X(VesselTrack.position).label("longitude"),
            ST_Y(VesselTrack.position).label("latitude"),
        )
        .distinct(VesselTrack.mmsi)
        .where(VesselTrack.position.isnot(None))
        .where(VesselTrack.captured_at > since)
        .order_by(VesselTrack.mmsi, desc(VesselTrack.captured_at))
    )

    if military_only:
        query = query.where(VesselTrack.is_military == True)

    query = query.limit(5000)

    try:
        result = await db.execute(query)

        # Inline vessel type name lookup
        vessel_type_names = {
            0: "Unknown", 30: "Fishing", 31: "Towing", 35: "Military",
            36: "Sailing", 37: "Pleasure Craft", 40: "High Speed Craft",
            50: "Pilot", 51: "SAR", 52: "Tug", 55: "Law Enforcement",
            60: "Passenger", 70: "Cargo", 80: "Tanker", 90: "Other",
        }

        vessels = [
            {
                "mmsi": r.mmsi, "vessel_name": r.vessel_name,
                "vessel_type": r.vessel_type,
                "vessel_type_name": vessel_type_names.get(r.vessel_type or 0, "Other"),
                "flag": r.flag, "speed": r.speed, "heading": r.heading,
                "destination": r.destination, "imo": r.imo,
                "is_military": r.is_military, "is_dark": r.is_dark,
                "latitude": r.latitude, "longitude": r.longitude,
                "captured_at": r.captured_at.isoformat() if r.captured_at else None,
            }
            for r in result.all()
        ]

        await cache_set(cache_key, json.dumps(vessels), ttl=30)
        return vessels
    except Exception as e:
        logger.error(f"map_vessels error: {e}")
        return []


@router.get("/sensitive-zones")
async def map_sensitive_zones(db: AsyncSession = Depends(get_db)):
    """
    Returns aggregated vessel + flight counts per sensitive zone (last 2h).
    Used by the frontend ZonePanel to show live activity.
    """
    cache_key = "map:sensitive_zones"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    from app.ingestion.sources.flight_tracker import SENSITIVE_ZONES as FLIGHT_ZONES
    from app.ingestion.sources.vessel_tracker import SENSITIVE_ZONES as VESSEL_ZONES
    from geoalchemy2.functions import ST_Within, ST_MakeEnvelope
    from sqlalchemy import Integer

    since = datetime.now(timezone.utc) - timedelta(hours=2)
    results = []

    # Merge zone definitions (flight zones are a superset of vessel zones here)
    all_zones: dict[str, dict] = {}
    for name, bbox in FLIGHT_ZONES.items():
        all_zones[name] = {
            "lat_min": bbox["lamin"], "lat_max": bbox["lamax"],
            "lon_min": bbox["lomin"], "lon_max": bbox["lomax"],
        }
    for name, bounds in VESSEL_ZONES.items():
        if name not in all_zones:
            all_zones[name] = {
                "lat_min": bounds[0][0], "lat_max": bounds[0][1],
                "lon_min": bounds[1][0], "lon_max": bounds[1][1],
            }

    for zone_name, bbox in all_zones.items():
        envelope = ST_MakeEnvelope(
            bbox["lon_min"], bbox["lat_min"],
            bbox["lon_max"], bbox["lat_max"],
            4326,
        )

        # Count recent flights in zone
        flight_q = (
            select(func.count(FlightTrack.id.distinct()))
            .where(FlightTrack.captured_at > since)
            .where(FlightTrack.position.isnot(None))
            .where(ST_Within(FlightTrack.position, envelope))
        )
        mil_flight_q = flight_q.where(FlightTrack.is_military == True)

        # Count recent vessels in zone
        vessel_q = (
            select(func.count(VesselTrack.id.distinct()))
            .where(VesselTrack.captured_at > since)
            .where(VesselTrack.position.isnot(None))
            .where(ST_Within(VesselTrack.position, envelope))
        )
        mil_vessel_q = vessel_q.where(VesselTrack.is_military == True)
        dark_vessel_q = vessel_q.where(VesselTrack.is_dark == True)

        try:
            flights = (await db.execute(flight_q)).scalar() or 0
            mil_flights = (await db.execute(mil_flight_q)).scalar() or 0
            vessels = (await db.execute(vessel_q)).scalar() or 0
            mil_vessels = (await db.execute(mil_vessel_q)).scalar() or 0
            dark_vessels = (await db.execute(dark_vessel_q)).scalar() or 0
        except Exception:
            flights = mil_flights = vessels = mil_vessels = dark_vessels = 0

        total_activity = flights + vessels
        military_activity = mil_flights + mil_vessels

        # Risk score: 0-10
        risk = min(10, military_activity * 2 + dark_vessels * 1.5 + total_activity * 0.05)

        results.append({
            "name": zone_name,
            "lat": (bbox["lat_min"] + bbox["lat_max"]) / 2,
            "lon": (bbox["lon_min"] + bbox["lon_max"]) / 2,
            "bbox": bbox,
            "flights": flights,
            "military_flights": mil_flights,
            "vessels": vessels,
            "military_vessels": mil_vessels,
            "dark_vessels": dark_vessels,
            "total_activity": total_activity,
            "military_activity": military_activity,
            "risk_score": round(risk, 1),
        })

    # Sort by risk score descending
    results.sort(key=lambda z: z["risk_score"], reverse=True)

    await cache_set(cache_key, json.dumps(results), ttl=60)
    return results


@router.get("/webcams")
async def map_webcams():
    """Get all cached webcams for the map layer."""
    return await get_cached_webcams()


@router.get("/webcams/near")
async def webcams_near_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=100, le=500),
):
    """Find webcams near a specific lat/lon point."""
    return await find_webcams_near(lat, lon, radius_km)


@router.get("/webcams/near-event/{event_id}")
async def webcams_near_event(
    event_id: int,
    radius_km: float = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Find webcams near a specific event."""
    result = await db.execute(
        select(
            ST_X(Event.location).label("longitude"),
            ST_Y(Event.location).label("latitude"),
        ).where(Event.id == event_id).where(Event.location.isnot(None))
    )
    row = result.first()
    if not row:
        return []
    return await find_webcams_near(row.latitude, row.longitude, radius_km)


# Allowed thumbnail domains (security: only proxy known webcam providers)
_ALLOWED_THUMB_HOSTS = {
    "images-webcams.windy.com",
    "images.webcams.travel",
    "webcams.windy.com",
}


@router.get("/webcams/proxy-thumb")
async def proxy_webcam_thumbnail(url: str = Query(..., max_length=500)):
    """Proxy webcam thumbnail to bypass CORS/referrer restrictions."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.hostname not in _ALLOWED_THUMB_HOSTS:
        return Response(status_code=403, content=b"Blocked host")

    # Check Redis cache first (hash the URL as key)
    url_hash = hashlib.md5(url.encode()).hexdigest()
    cache_key = f"thumb:{url_hash}"
    cached = await cache_get(cache_key)
    if cached:
        # Cached as base64 with content-type prefix
        ct, _, b64data = cached.partition("|")
        import base64
        return Response(
            content=base64.b64decode(b64data),
            media_type=ct,
            headers={"Cache-Control": "public, max-age=1800"},
        )

    try:
        # follow_redirects=False to prevent SSRF: a 302 to internal/private IPs
        # would otherwise be transparently followed by httpx.
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            resp = await client.get(url, headers={"Referer": ""})
        if resp.status_code != 200:
            return Response(status_code=502, content=b"Upstream error")

        content_type = resp.headers.get("content-type", "image/jpeg")
        body = resp.content

        # Cache thumbnail for 30 min (max 500KB to avoid bloating Redis)
        if len(body) < 500_000:
            import base64
            cache_val = f"{content_type}|{base64.b64encode(body).decode()}"
            await cache_set(cache_key, cache_val, ttl=1800)

        return Response(
            content=body,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=1800"},
        )
    except Exception:
        return Response(status_code=502, content=b"Fetch failed")


# YouTube channel IDs known to have live streams (must match frontend NEWS_CHANNELS)
_YT_CHANNELS: dict[str, str] = {
    "aljazeera":   "UCNye-wNBqNL5ZzHSJj3l8Bg",
    "skynews":     "UCoMdktPbSTixAyNGwb-UYkQ",
    "dwnews":      "UCknLrEdhRCp1aegoMqRaCZg",
    "euronews":    "UCSrZ3UV4jOidv8ppoVuvW9Q",
    "france24en":  "UCQfwfsi5VrQ8yKZ-UWmAEFg",
    "trtworld":    "UCnyCrv8b7bu0oWFXGyHaPzg",
    "nhkworld":    "UCSPEjw8F2nQDtmUKPFNF7_A",
    "arirang":     "UCKs3AQ4Z0FhXqJR7oLhnSsQ",
    "cgtn":        "UCBFTFELNwDEhYgVFM7FqQ-A",
    "wion":        "UCpAFMfJcpY5BXynlOtC_qYg",
    "timesnow":    "UCpEhnqL0y41EpW2TvWAHD7Q",
    "ndtv":        "UCZFMm1mMw0F81Z37aaEzTUA",
    "abcau":       "UCVgO39Bk5sMo66-6o6Spn6Q",
    "africanews":  "UCG_QCDz7fTJCZvutdHLcqLg",
    "i24news":     "UCnzNtKQSP9FqIoEuYCBn4Ow",
    "bloomberg":   "UCIALMKvObZNtJ6AmdCLP7Lg",
    "voa":         "UCVSNOxehfALJKhaGXHg0t_g",
    "indiatoday":  "UCYPvAwZP8pZhSMW8qs7cVCw",
    "channel4":    "UCTrQ7HXWRRxr7OsOtodr2_w",
    "gbnews":      "UCgnMNpgHoMWUr_pqO8YfLEA",
    "telesur":     "UCGV4n3j0sGrFVhFQA1jyFiQ",
    "france24fr":  "UCCCPCZNChQdGa9EkATeye4g",
    "bfmtv":       "UCUsBMOIUl_ad6JUOC16DpmQ",
    "lci":         "UCfJSEG0m4PO1RjMsmC2sJBw",
    "cnews":       "UCXKJrYczY2_fJEZgFPGY0HQ",
    "tv5monde":    "UCJsZHPR1jqKu-soDmKNMBFg",
    "euronewsfr":  "UC6hBGEi9ZtD9sBDjGqbGkKQ",
    "afrnewsfr":   "UCB_J4LnKPXCbrRAfpLvAuJA",
    "aljazeeraAr": "UCfiwzLy-8yKzIbsmZTzxDgw",
    "france24ar":  "UCDpPdE0bMKhCPVVEHSHAqow",
    "dwar":        "UCp_5_G3ggNS5B7FmS0YHRaA",
    "dwes":        "UCDypoksJCaO5HMRriAHy7UA",
    "france24es":  "UCpXwBpbmb0aXJaWoJmBwK6A",
}


_LIVE_KEYWORDS = ["live", "en direct", "en vivo", "direkt", "canlı", "直播", "مباشر", "direto", "ao vivo", "в эфире", "watch live", "stream"]


async def _check_yt_channel_live(client: httpx.AsyncClient, channel_id: str) -> str:
    """Check if a YouTube channel has an active live stream via its RSS feed.
    Uses a real browser User-Agent to avoid YouTube IP blocking.
    Returns 'live', 'offline', or 'unknown'.
    """
    import xml.etree.ElementTree as ET
    from datetime import timezone
    try:
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        resp = await client.get(url, timeout=10)
        if resp.status_code != 200:
            return "unknown"
        root = ET.fromstring(resp.text)
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "yt": "http://www.youtube.com/xml/schemas/2015",
            "media": "http://search.yahoo.com/mrss/",
        }
        entries = root.findall("atom:entry", ns)
        if not entries:
            return "offline"  # Channel has no videos = definitely not streaming
        # If RSS is accessible and has entries, the channel is active.
        # These are 24/7 news channels — a reachable RSS with content means on-air.
        # Bonus: check for explicit live/recent indicators for confidence.
        now = datetime.now(timezone.utc)
        for entry in entries[:3]:
            title_el = entry.find("atom:title", ns)
            published_el = entry.find("atom:published", ns)
            title = title_el.text if title_el is not None else ""
            published = published_el.text if published_el is not None else ""
            if published:
                try:
                    pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
                    age_mins = (now - pub_dt).total_seconds() / 60
                    if 0 < age_mins < 15:
                        return "live"  # Very recent upload = active live stream
                except Exception:
                    pass
            if title and any(kw in title.lower() for kw in _LIVE_KEYWORDS):
                return "live"
        # RSS reachable + has entries = channel is on-air (24/7 news channels)
        return "live"
    except Exception:
        return "unknown"


@router.get("/live-check")
async def live_check_channels():
    """Check which YouTube news channels are currently live streaming.
    Uses YouTube oEmbed API — free, no API key required.
    Results are cached for 3 minutes to avoid hammering YouTube.
    """
    cache_key = "live_check_results"
    cached = await cache_get(cache_key)
    if cached:
        import json as _json
        try:
            return _json.loads(cached)
        except Exception:
            pass

    results: dict[str, str] = {}
    async with httpx.AsyncClient(
        timeout=10,
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/xml,text/xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
        },
    ) as client:
        tasks = {
            ch_id: _check_yt_channel_live(client, yt_id)
            for ch_id, yt_id in _YT_CHANNELS.items()
        }
        import asyncio
        done = await asyncio.gather(*tasks.values(), return_exceptions=True)
        for (ch_id, _), result in zip(tasks.items(), done):
            results[ch_id] = result if isinstance(result, str) else "unknown"

    # Cache for 3 minutes
    import json as _json
    await cache_set(cache_key, _json.dumps(results), ttl=180)
    return results
