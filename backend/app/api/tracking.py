from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_X, ST_Y, ST_Within, ST_MakeEnvelope
from app.database import get_db
from app.models.tracking import FlightTrack, VesselTrack, TrackingAnomaly
from app.redis_client import cache_get, cache_set
from datetime import datetime, timezone, timedelta
import json

router = APIRouter()

# Sensitive zones for anomaly detection
SENSITIVE_ZONES = {
    "Taiwan Strait":     {"lat_min": 22.0, "lat_max": 26.0, "lon_min": 117.0, "lon_max": 122.0},
    "South China Sea":   {"lat_min": 5.0,  "lat_max": 18.0, "lon_min": 108.0, "lon_max": 121.0},
    "Persian Gulf":      {"lat_min": 24.0, "lat_max": 30.0, "lon_min": 48.0,  "lon_max": 56.5},
    "Black Sea":         {"lat_min": 41.0, "lat_max": 47.0, "lon_min": 27.0,  "lon_max": 42.0},
    "Red Sea":           {"lat_min": 12.0, "lat_max": 30.0, "lon_min": 32.0,  "lon_max": 44.0},
    "Baltic Sea":        {"lat_min": 53.0, "lat_max": 66.0, "lon_min": 10.0,  "lon_max": 30.0},
    "Strait of Hormuz":  {"lat_min": 25.0, "lat_max": 27.5, "lon_min": 55.0,  "lon_max": 57.5},
    "East Med":          {"lat_min": 31.0, "lat_max": 37.0, "lon_min": 27.0,  "lon_max": 36.0},
}


def _point_in_zone(lat: float, lon: float) -> str | None:
    """Check if a point is within any sensitive zone."""
    for name, bbox in SENSITIVE_ZONES.items():
        if bbox["lat_min"] <= lat <= bbox["lat_max"] and bbox["lon_min"] <= lon <= bbox["lon_max"]:
            return name
    return None


@router.get("/flights")
async def list_tracked_flights(
    military_only: bool = False,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    query = (
        select(FlightTrack)
        .where(FlightTrack.captured_at > since)
        .order_by(desc(FlightTrack.captured_at))
    )
    if military_only:
        query = query.where(FlightTrack.is_military == True)
    query = query.limit(limit)

    result = await db.execute(query)
    return [
        {
            "icao24": f.icao24,
            "callsign": f.callsign,
            "aircraft_type": f.aircraft_type,
            "origin_country": f.origin_country,
            "altitude": f.altitude,
            "velocity": f.velocity,
            "heading": f.heading,
            "squawk": f.squawk,
            "is_military": f.is_military,
            "is_government": f.is_government,
            "captured_at": f.captured_at.isoformat(),
        }
        for f in result.scalars().all()
    ]


@router.get("/vessels")
async def list_tracked_vessels(
    military_only: bool = False,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    query = (
        select(VesselTrack)
        .where(VesselTrack.captured_at > since)
        .order_by(desc(VesselTrack.captured_at))
    )
    if military_only:
        query = query.where(VesselTrack.is_military == True)
    query = query.limit(limit)

    result = await db.execute(query)
    return [
        {
            "mmsi": v.mmsi,
            "vessel_name": v.vessel_name,
            "vessel_type": v.vessel_type,
            "flag": v.flag,
            "speed": v.speed,
            "heading": v.heading,
            "destination": v.destination,
            "is_military": v.is_military,
            "is_dark": v.is_dark,
            "captured_at": v.captured_at.isoformat(),
        }
        for v in result.scalars().all()
    ]


@router.get("/anomalies")
async def list_anomalies(
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Detect anomalies in real-time from flight/vessel tracks."""
    # Cache for 60 seconds — anomaly detection is expensive
    cached = await cache_get("tracking:anomalies")
    if cached:
        return json.loads(cached)

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=2)
    anomalies: list[dict] = []

    # ── DARK VESSELS in sensitive zones ──
    dark_q = (
        select(
            VesselTrack.mmsi, VesselTrack.vessel_name,
            VesselTrack.vessel_type, VesselTrack.flag,
            VesselTrack.captured_at,
            ST_X(VesselTrack.position).label("lon"),
            ST_Y(VesselTrack.position).label("lat"),
        )
        .distinct(VesselTrack.mmsi)
        .where(VesselTrack.is_dark == True)
        .where(VesselTrack.position.isnot(None))
        .where(VesselTrack.captured_at > since)
        .order_by(VesselTrack.mmsi, desc(VesselTrack.captured_at))
        .limit(200)
    )
    dark_result = await db.execute(dark_q)
    for v in dark_result.all():
        if v.lat and v.lon:
            zone = _point_in_zone(v.lat, v.lon)
            if zone:
                anomalies.append({
                    "type": "DARK_VESSEL",
                    "severity": 8,
                    "description": f"Dark vessel {v.vessel_name or 'UNKNOWN'} (MMSI: {v.mmsi}) detected in {zone} with AIS transponder off",
                    "asset_id": v.mmsi,
                    "asset_name": v.vessel_name,
                    "latitude": v.lat,
                    "longitude": v.lon,
                    "zone": zone,
                    "detected_at": v.captured_at.isoformat() if v.captured_at else now.isoformat(),
                })

    # ── UNIDENTIFIED MILITARY VESSELS (no name, no IMO) ──
    mil_vessel_q = (
        select(
            VesselTrack.mmsi, VesselTrack.vessel_name, VesselTrack.imo,
            VesselTrack.flag, VesselTrack.captured_at,
            ST_X(VesselTrack.position).label("lon"),
            ST_Y(VesselTrack.position).label("lat"),
        )
        .distinct(VesselTrack.mmsi)
        .where(VesselTrack.is_military == True)
        .where(VesselTrack.position.isnot(None))
        .where(VesselTrack.captured_at > since)
        .where(
            (VesselTrack.vessel_name.is_(None)) | (VesselTrack.vessel_name == "")
        )
        .where(
            (VesselTrack.imo.is_(None)) | (VesselTrack.imo == "")
        )
        .order_by(VesselTrack.mmsi, desc(VesselTrack.captured_at))
        .limit(100)
    )
    mil_vessel_result = await db.execute(mil_vessel_q)
    for v in mil_vessel_result.all():
        if v.lat and v.lon:
            zone = _point_in_zone(v.lat, v.lon)
            anomalies.append({
                "type": "UNIDENTIFIED_MILITARY_VESSEL",
                "severity": 7,
                "description": f"Unidentified military vessel (MMSI: {v.mmsi}) with no name/IMO{f' in {zone}' if zone else ''}",
                "asset_id": v.mmsi,
                "asset_name": None,
                "latitude": v.lat,
                "longitude": v.lon,
                "zone": zone,
                "detected_at": v.captured_at.isoformat() if v.captured_at else now.isoformat(),
            })

    # ── MILITARY FLIGHTS without squawk ──
    mil_flight_q = (
        select(
            FlightTrack.icao24, FlightTrack.callsign,
            FlightTrack.aircraft_type, FlightTrack.captured_at,
            ST_X(FlightTrack.position).label("lon"),
            ST_Y(FlightTrack.position).label("lat"),
        )
        .distinct(FlightTrack.icao24)
        .where(FlightTrack.is_military == True)
        .where(FlightTrack.position.isnot(None))
        .where(FlightTrack.captured_at > since)
        .where(
            (FlightTrack.squawk.is_(None)) | (FlightTrack.squawk == "")
        )
        .order_by(FlightTrack.icao24, desc(FlightTrack.captured_at))
        .limit(100)
    )
    mil_flight_result = await db.execute(mil_flight_q)
    for f in mil_flight_result.all():
        if f.lat and f.lon:
            zone = _point_in_zone(f.lat, f.lon)
            anomalies.append({
                "type": "NO_SQUAWK_MILITARY",
                "severity": 6,
                "description": f"Military aircraft {f.callsign or f.icao24} ({f.aircraft_type or 'unknown type'}) flying without squawk code{f' over {zone}' if zone else ''}",
                "asset_id": f.icao24,
                "asset_name": f.callsign,
                "latitude": f.lat,
                "longitude": f.lon,
                "zone": zone,
                "detected_at": f.captured_at.isoformat() if f.captured_at else now.isoformat(),
            })

    # Sort by severity descending, then by detected_at
    anomalies.sort(key=lambda a: (-a["severity"], a["detected_at"]))
    anomalies = anomalies[:limit]

    await cache_set("tracking:anomalies", json.dumps(anomalies), ttl=60)
    return anomalies
