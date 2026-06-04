"""
Vessel tracker — AISstream WebSocket ingestion (STRATEGIC MODE).

Only stores vessels with geopolitical / intelligence relevance:
  - Military & law enforcement vessels (AIS types 35, 55)
  - Cargo ships (AIS types 70-79) — supply chain & strategic logistics
  - Tankers (AIS types 80-89) — oil/gas, sanctions evasion
  - Dark vessels (no name, near-stationary, no AIS type) — smuggling/sanctions
  - SAR / medical transport (types 51, 58) — crisis indicators
  - Any vessel in a sensitive maritime zone (even fishing/passenger)

Pleasure craft, sailing, yachts outside sensitive zones are SKIPPED.
"""
import logging
import json
import asyncio
import websockets
from datetime import datetime, timezone

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings
from app.database import async_session
from app.models.tracking import VesselTrack
from app.websocket import emit_event
from geoalchemy2.elements import WKTElement

logger = logging.getLogger(__name__)
settings = get_settings()

AISSTREAM_WS = "wss://stream.aisstream.io/v0/stream"

# ── Sensitive maritime zones ───────────────────────────────────────────────────
SENSITIVE_ZONES: dict[str, list] = {
    # Classic chokepoints
    "Strait of Hormuz":      [[25.5, 27.0],  [55.5, 57.0]],
    "Suez Canal":            [[29.8, 31.3],  [32.0, 33.0]],
    "Bab el-Mandeb":         [[11.5, 13.5],  [42.5, 44.5]],
    "Strait of Malacca":     [[1.0,  4.5],   [99.0, 104.5]],
    "Taiwan Strait":         [[22.5, 26.5],  [117.0, 121.5]],
    "Strait of Gibraltar":   [[35.8, 36.3],  [-6.0, -4.8]],
    "English Channel":       [[49.5, 52.0],  [-3.0, 2.5]],
    "Danish Straits":        [[54.5, 58.0],  [9.5, 13.5]],
    "Bosphorus":             [[40.9, 41.6],  [28.6, 29.4]],
    "Mozambique Channel":    [[-20.0, -10.0],[38.0, 45.0]],
    # Conflict / high-risk maritime zones
    "Red Sea":               [[12.0, 30.0],  [32.0, 44.0]],
    "Persian Gulf":          [[23.5, 30.0],  [48.0, 57.0]],
    "South China Sea":       [[5.0,  22.0],  [108.0, 120.0]],
    "Black Sea":             [[41.0, 46.5],  [27.5, 41.5]],
    "Eastern Mediterranean": [[30.0, 37.0],  [26.0, 37.0]],
    "Gulf of Aden":          [[11.0, 15.0],  [42.0, 52.0]],
    "Arabian Sea":           [[14.0, 25.0],  [55.0, 68.0]],
    "Korean Strait":         [[33.0, 36.0],  [128.0, 132.0]],
    "Baltic Sea":            [[54.0, 66.0],  [12.0, 28.0]],
    "Kerch Strait":          [[45.0, 46.0],  [36.0, 37.0]],
    "Odesa Region":          [[45.5, 47.0],  [30.0, 32.5]],
    "Horn of Africa":        [[8.0,  15.0],  [45.0, 52.0]],
    "West Africa":           [[3.0,  10.0],  [0.0,  10.0]],
}

MILITARY_VESSEL_TYPES = {35, 55}  # Military, Law Enforcement
CARGO_TANKER_TYPES = {70, 71, 72, 73, 74, 75, 76, 77, 78, 79,  # Cargo
                      80, 81, 82, 83, 84, 85, 86, 87, 88, 89}   # Tankers

# Strategic vessel types — always store regardless of location
STRATEGIC_TYPES = MILITARY_VESSEL_TYPES | CARGO_TANKER_TYPES | {
    51,  # SAR (Search and Rescue)
    58,  # Medical Transport
}

# Vessel types to SKIP outside sensitive zones
SKIP_TYPES_OUTSIDE_ZONE = {
    36,  # Sailing
    37,  # Pleasure Craft
    30,  # Fishing (skip outside zones — massive volume)
}

VESSEL_TYPE_NAMES: dict[int, str] = {
    0: "Unknown", 30: "Fishing", 31: "Towing", 32: "Towing Large",
    33: "Dredging", 34: "Diving Ops", 35: "Military", 36: "Sailing",
    37: "Pleasure Craft", 40: "High Speed Craft", 50: "Pilot",
    51: "SAR", 52: "Tug", 53: "Port Tender", 54: "Anti-Pollution",
    55: "Law Enforcement", 58: "Medical Transport",
    60: "Passenger", 69: "Passenger",
    70: "Cargo", 79: "Cargo",
    80: "Tanker", 89: "Tanker",
    90: "Other",
}

# Event cooldowns
ZONE_MILITARY_COOLDOWN = 600
DARK_VESSEL_COOLDOWN = 1800
FORMATION_COOLDOWN = 3600
TANKER_RISK_COOLDOWN = 7200


class VesselTrackerSource(BaseSource):
    name = "vessel_tracker"
    interval = settings.vessel_scan_interval or 120
    credibility = 8.0

    def __init__(self):
        super().__init__()
        self._seen_military: dict[str, float] = {}
        self._seen_dark: dict[str, float] = {}
        self._seen_formations: dict[str, float] = {}
        self._seen_tanker_risk: dict[str, float] = {}

    async def fetch(self) -> list[RawEvent]:
        if not settings.aisstream_api_key:
            logger.debug("AISstream API key not configured, skipping")
            return []

        now = datetime.now(timezone.utc).timestamp()
        self._prune_caches(now)

        events: list[RawEvent] = []
        vessels_saved = 0
        vessels_skipped = 0

        zone_military: dict[str, list[dict]] = {z: [] for z in SENSITIVE_ZONES}
        zone_tankers: dict[str, int] = {z: 0 for z in SENSITIVE_ZONES}

        try:
            subscribe_msg = {
                "APIKey": settings.aisstream_api_key,
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
                "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
            }

            async with websockets.connect(
                AISSTREAM_WS,
                close_timeout=5,
                open_timeout=30,
                ping_interval=20,
                ping_timeout=15,
                max_size=2 ** 21,
            ) as ws:
                await ws.send(json.dumps(subscribe_msg))

                position_count = 0
                max_positions = 5000
                static_cache: dict[str, dict] = {}

                async with async_session() as db:
                    while position_count < max_positions:
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=60)
                            data = json.loads(msg)
                            msg_type = data.get("MessageType", "")
                            meta = data.get("MetaData", {})
                            mmsi = str(meta.get("MMSI", ""))

                            # Cache static data (no position budget cost)
                            if msg_type == "ShipStaticData":
                                static_msg = data.get("Message", {}).get("ShipStaticData", {})
                                static_cache[mmsi] = {
                                    "vessel_name": (meta.get("ShipName") or
                                                    static_msg.get("ShipName") or "").strip(),
                                    "ship_type": int(static_msg.get("Type") or
                                                     meta.get("ShipType") or 0),
                                    "destination": (static_msg.get("Destination") or "").strip(),
                                    "flag": meta.get("Flag") or "",
                                    "imo": str(static_msg.get("ImoNumber") or ""),
                                }
                                continue

                            if msg_type != "PositionReport":
                                continue

                            pos_report = data.get("Message", {}).get("PositionReport", {})
                            lat = pos_report.get("Latitude")
                            lon = pos_report.get("Longitude")

                            if lat is None or lon is None:
                                continue
                            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                                continue

                            # Enrich with static cache
                            static = static_cache.get(mmsi, {})
                            vessel_name = (static.get("vessel_name") or
                                           meta.get("ShipName", "").strip())
                            ship_type = int(static.get("ship_type") or
                                            meta.get("ShipType") or 0)
                            destination = static.get("destination", "")
                            flag = static.get("flag", "")
                            imo = static.get("imo", "")

                            speed = pos_report.get("Sog")
                            heading = pos_report.get("TrueHeading")
                            if heading == 511:
                                heading = pos_report.get("Cog")

                            is_military = ship_type in MILITARY_VESSEL_TYPES
                            is_cargo_tanker = ship_type in CARGO_TANKER_TYPES
                            is_dark = bool(
                                not vessel_name and
                                speed is not None and speed < 0.5 and
                                ship_type == 0
                            )

                            zone = self._check_zone(lat, lon)

                            # ── STRATEGIC FILTER ──
                            # Always keep: military, cargo, tanker, SAR, dark vessels
                            # In zone: keep everything
                            # Outside zone: skip pleasure, sailing, fishing, unknown slow
                            if not self._is_relevant(ship_type, is_dark, zone):
                                vessels_skipped += 1
                                position_count += 1
                                continue

                            track = VesselTrack(
                                mmsi=mmsi,
                                vessel_name=vessel_name or None,
                                vessel_type=ship_type,
                                flag=flag or None,
                                position=WKTElement(f"POINT({lon} {lat})", srid=4326),
                                speed=speed,
                                heading=heading,
                                destination=destination or None,
                                imo=imo or None,
                                is_military=is_military,
                                is_dark=is_dark,
                            )
                            db.add(track)
                            vessels_saved += 1
                            position_count += 1

                            # ── Event generation ──
                            if zone:
                                if is_military:
                                    zone_military[zone].append({
                                        "mmsi": mmsi, "name": vessel_name,
                                        "lat": lat, "lon": lon
                                    })
                                if is_cargo_tanker:
                                    zone_tankers[zone] += 1

                            # Military vessel in sensitive zone
                            if is_military and zone:
                                key = f"{mmsi}:{zone}"
                                if now - self._seen_military.get(key, 0) > ZONE_MILITARY_COOLDOWN:
                                    self._seen_military[key] = now
                                    vtype = VESSEL_TYPE_NAMES.get(ship_type, "Military")
                                    events.append(RawEvent(
                                        source="aisstream",
                                        text=f"{vtype} vessel {vessel_name or mmsi}"
                                             f" [{flag}] detected in {zone}",
                                        latitude=lat, longitude=lon, credibility=8.5,
                                        metadata={"mmsi": mmsi, "zone": zone,
                                                  "vessel_name": vessel_name,
                                                  "flag": flag, "type": "naval_movement"},
                                    ))

                            # Dark vessel in sensitive zone
                            if is_dark and zone:
                                if now - self._seen_dark.get(mmsi, 0) > DARK_VESSEL_COOLDOWN:
                                    self._seen_dark[mmsi] = now
                                    events.append(RawEvent(
                                        source="aisstream",
                                        text=f"Dark vessel (no AIS ID) detected in {zone} "
                                             f"— speed {speed:.1f}kn, no name/destination",
                                        latitude=lat, longitude=lon, credibility=7.5,
                                        metadata={"mmsi": mmsi, "zone": zone,
                                                  "speed": speed, "type": "dark_vessel"},
                                    ))

                        except asyncio.TimeoutError:
                            break

                    # ── Formation detection ──
                    for zone_name, mil_vessels in zone_military.items():
                        if len(mil_vessels) >= 3:
                            key = f"formation:{zone_name}"
                            if now - self._seen_formations.get(key, 0) > FORMATION_COOLDOWN:
                                self._seen_formations[key] = now
                                lat_c = sum(v["lat"] for v in mil_vessels) / len(mil_vessels)
                                lon_c = sum(v["lon"] for v in mil_vessels) / len(mil_vessels)
                                names = ", ".join(v["name"] or v["mmsi"]
                                                  for v in mil_vessels[:4])
                                events.append(RawEvent(
                                    source="aisstream",
                                    text=f"Naval formation detected in {zone_name}: "
                                         f"{len(mil_vessels)} military vessels ({names}...)",
                                    latitude=lat_c, longitude=lon_c, credibility=9.0,
                                    metadata={"zone": zone_name, "count": len(mil_vessels),
                                              "type": "naval_formation"},
                                ))

                    # ── Tanker risk in conflict zones ──
                    HIGH_RISK_ZONES = {"Red Sea", "Bab el-Mandeb", "Strait of Hormuz",
                                       "Gulf of Aden", "Persian Gulf", "Black Sea", "Odesa Region"}
                    for zone_name, tanker_count in zone_tankers.items():
                        if zone_name in HIGH_RISK_ZONES and tanker_count >= 5:
                            key = f"tanker:{zone_name}"
                            if now - self._seen_tanker_risk.get(key, 0) > TANKER_RISK_COOLDOWN:
                                self._seen_tanker_risk[key] = now
                                bbox = SENSITIVE_ZONES[zone_name]
                                lat_c = (bbox[0][0] + bbox[0][1]) / 2
                                lon_c = (bbox[1][0] + bbox[1][1]) / 2
                                events.append(RawEvent(
                                    source="aisstream",
                                    text=f"Commercial shipping activity in high-risk zone "
                                         f"{zone_name}: {tanker_count} cargo/tanker vessels",
                                    latitude=lat_c, longitude=lon_c, credibility=6.5,
                                    metadata={"zone": zone_name, "tanker_count": tanker_count,
                                              "type": "shipping_risk"},
                                ))

                    await db.commit()
                    logger.info(
                        f"VesselTracker: {vessels_saved} strategic saved, "
                        f"{vessels_skipped} civilian skipped, "
                        f"{len(static_cache)} with static data, "
                        f"{len(events)} events"
                    )

            try:
                await emit_event("tracking", "tracking_update",
                                 {"type": "vessels", "count": vessels_saved})
            except Exception as e:
                logger.warning(f"Failed to emit vessel tracking update: {e}")

        except Exception as e:
            logger.error(f"AISstream connection failed: {e}")

        return events

    def _is_relevant(self, ship_type: int, is_dark: bool, zone: str | None) -> bool:
        """Determine if a vessel is worth storing."""
        # Dark vessels are always interesting
        if is_dark:
            return True
        # Strategic types are always stored
        if ship_type in STRATEGIC_TYPES:
            return True
        # In a sensitive zone — keep everything (even fishing)
        if zone:
            return True
        # Outside zones: skip pleasure, sailing, fishing, unknown slow
        if ship_type in SKIP_TYPES_OUTSIDE_ZONE:
            return False
        # Unknown type (0) outside zone with no dark flag — skip
        if ship_type == 0:
            return False
        # Passenger, tug, pilot, HSC, etc. outside zone — keep (less common)
        return True

    def _check_zone(self, lat: float, lon: float) -> str | None:
        for name, bounds in SENSITIVE_ZONES.items():
            lat_range, lon_range = bounds
            if lat_range[0] <= lat <= lat_range[1] and lon_range[0] <= lon <= lon_range[1]:
                return name
        return None

    def _prune_caches(self, now: float) -> None:
        cutoff_military = now - ZONE_MILITARY_COOLDOWN
        cutoff_dark = now - DARK_VESSEL_COOLDOWN
        cutoff_formation = now - FORMATION_COOLDOWN * 2
        cutoff_tanker = now - TANKER_RISK_COOLDOWN * 2
        self._seen_military = {k: v for k, v in self._seen_military.items()
                                if v > cutoff_military}
        self._seen_dark = {k: v for k, v in self._seen_dark.items()
                           if v > cutoff_dark}
        self._seen_formations = {k: v for k, v in self._seen_formations.items()
                                  if v > cutoff_formation}
        self._seen_tanker_risk = {k: v for k, v in self._seen_tanker_risk.items()
                                   if v > cutoff_tanker}
