"""
Flight tracker — multi-source ADS-B ingestion (STRATEGIC MODE).

Only ingests aircraft with geopolitical / intelligence relevance:
  - Military aircraft (callsign prefix or ICAO type)
  - Government / VIP flights (SAM, EXEC, AIR1, etc.)
  - Emergency squawks (7500 hijack, 7600 comms, 7700 emergency)
  - Heavy cargo / logistics (FedEx, UPS, Cargolux, Antonov, etc.)
  - Any aircraft operating inside a sensitive airspace zone
  - A random sample of civilian flights (up to 500) for coverage

Sources (priority order):
  1. OpenSky    (reliable, returns 6000+ states)
  2. ADSB.fi    (free, no key, ~10k-20k aircraft, great military coverage)
  3. ADSB.lol   (free, no key, community-driven)
  4. ADS-B Exchange (if ADSB_EXCHANGE_API_KEY configured, best military data)
"""
import logging
import random
import httpx
from datetime import datetime, timezone

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings
from app.database import async_session
from app.models.tracking import FlightTrack
from app.websocket import emit_event
from geoalchemy2.elements import WKTElement

logger = logging.getLogger(__name__)
settings = get_settings()

OPENSKY_URL = "https://opensky-network.org/api/states/all"
ADSBFI_URL = "https://api.adsb.fi/v1/aircraft"
ADSBLOL_URL = "https://api.adsb.lol/v2/"
ADSBEXCHANGE_URL = "https://adsbexchange-com1.p.rapidapi.com/v2/all/"

# ── Military callsign prefixes (expanded) ─────────────────────────────────────
MILITARY_CALLSIGN_PREFIXES = [
    # US Air Force / DoD transport & logistics
    "RCH", "REACH", "ATLAS", "SPAR", "CNV", "TOPCAT",
    "FORTE", "DUKE", "HOMER", "JAKE", "NCHO", "LAGR", "ORDER",
    "POLAR", "EVAC", "NAVY", "VALOR", "GLORY", "DEMON", "GATOR",
    "BRASS", "LOKI", "SIGGY", "IRON", "STEEL", "ROOK", "PAVE",
    "KNIFE", "DAGGER", "SWORD", "LANCE", "JAVELIN", "ARROW",
    "SHIELD", "HAMMER", "BOXER", "BISON", "WOLF", "FOX", "BEAR",
    "VIPER", "TITAN", "GHOST", "TITUS", "COBRA",
    # US Presidential / VIP
    "SAM", "EXEC", "AIR1", "AIR2", "MARINE1", "MARINE2",
    # US Navy / strategic
    "TACAMO", "COPPER", "SCRAP", "VENUS", "TABOR",
    # US ISR / recon
    "SIGINT", "DRAGON", "REAPER", "PREDATOR",
    # UK RAF
    "RAF", "ASCOT", "TARTAN", "TUDOR", "COMET", "BALDRICK", "VOYAGER",
    # French Armée de l'Air
    "FAF", "COTAM", "FRENCHAF",
    # German Luftwaffe
    "GAF", "GAFCC",
    # NATO
    "NATO", "OTAN", "NATOEX",
    # Russian Air Force
    "RFF", "RFN", "RFA",
    # Chinese PLAAF
    "CCA", "CCB", "CAF",
    # Israeli IAF
    "IAF", "ISRAF",
    # Turkish
    "TUAF",
    # Swedish
    "SWAF",
    # Medical / MEDEVAC (always high priority)
    "MEDEVAC", "HOSP",
]

# Heavy cargo / strategic logistics callsign prefixes
CARGO_CALLSIGN_PREFIXES = [
    "FDX",   # FedEx
    "UPS",   # UPS
    "GTI",   # Atlas Air
    "CLX",   # Cargolux
    "GEC",   # Lufthansa Cargo
    "ABW",   # AirBridgeCargo (Volga-Dnepr group)
    "VDA",   # Volga-Dnepr (AN-124 operator)
    "ADB",   # Antonov Design Bureau
    "CKS",   # Kalitta Air
    "SQC",   # Singapore Airlines Cargo
    "CAO",   # Air China Cargo
    "MPH",   # Martinair (KLM Cargo)
    "AZG",   # Silk Way West Airlines (Azerbaijan strategic cargo)
    "BOX",   # AeroLogic (DHL/Lufthansa JV)
    "DHK",   # DHL Hong Kong Air Cargo
    "BCS",   # European Air Transport (DHL)
    "DHL",   # DHL
    "POT",   # Polet Airlines (Russian heavy cargo)
    "RCF",   # Atran (Russian cargo)
    "TYA",   # Turkish Cargo
]

# Aircraft ICAO type codes that are almost exclusively military/government
MILITARY_AIRCRAFT_TYPES = {
    # Strategic bombers
    "B52", "B2", "B21", "TU95", "TU160", "TU22",
    # Military transports
    "C17", "C130", "C5", "C141", "C27", "AN124", "AN225", "IL76",
    # Tankers
    "KC135", "KC46", "KC10", "A330M",
    # AWACS / command
    "E3", "E4", "E6", "E7", "E8",
    # Recon / ISR
    "RC135", "EP3", "U2", "SR71",
    # Maritime patrol
    "P8", "P3",
    # Drones (large military)
    "RQ4", "MQ9", "MQ1",
    # Osprey
    "V22",
    # Fighter jets
    "F22", "F35", "F18", "F16", "F15", "F14", "SU35", "SU27", "SU57",
    "MIG29", "MIG31", "MIG35", "JH7", "J10", "J11", "J16", "J20",
    # Attack
    "A10", "SU25",
    # Military helicopters
    "AH64", "UH60", "CH47", "H1",
}

# Heavy cargo aircraft types (strategic logistics)
CARGO_AIRCRAFT_TYPES = {
    "AN124", "AN225", "IL76",  # Soviet/Russian heavy lift
    "B744", "B748", "B77L", "B77F",  # Boeing freighters
    "A332", "A333",  # Airbus freighters (A330F)
    "MD11",  # MD-11F
    "B764", "B763",  # 767 freighters (UPS/FedEx)
}

# ── Sensitive airspace zones ───────────────────────────────────────────────────
SENSITIVE_ZONES: dict[str, dict] = {
    "Taiwan Strait":         {"lamin": 23.0, "lomin": 117.0, "lamax": 26.5, "lomax": 122.0},
    "South China Sea":       {"lamin": 5.0,  "lomin": 108.0, "lamax": 22.0, "lomax": 120.0},
    "Strait of Hormuz":      {"lamin": 25.0, "lomin": 55.0,  "lamax": 27.5, "lomax": 58.0},
    "Persian Gulf":          {"lamin": 23.5, "lomin": 48.0,  "lamax": 30.0, "lomax": 57.0},
    "Eastern Ukraine":       {"lamin": 46.0, "lomin": 33.0,  "lamax": 52.0, "lomax": 40.0},
    "Black Sea":             {"lamin": 41.0, "lomin": 27.5,  "lamax": 46.5, "lomax": 41.5},
    "Red Sea":               {"lamin": 12.0, "lomin": 32.0,  "lamax": 30.0, "lomax": 44.0},
    "Bab el-Mandeb":         {"lamin": 11.5, "lomin": 42.5,  "lamax": 13.5, "lomax": 44.5},
    "Baltic Sea":            {"lamin": 54.0, "lomin": 12.0,  "lamax": 66.0, "lomax": 28.0},
    "Korean Peninsula":      {"lamin": 35.0, "lomin": 124.0, "lamax": 43.0, "lomax": 131.0},
    "Eastern Mediterranean": {"lamin": 30.0, "lomin": 26.0,  "lamax": 37.0, "lomax": 37.0},
    "Gaza/Israel":           {"lamin": 29.5, "lomin": 33.5,  "lamax": 33.5, "lomax": 36.5},
    "Bering Strait":         {"lamin": 62.0, "lomin": -170.0,"lamax": 68.0, "lomax": -162.0},
    "Arctic Russia":         {"lamin": 68.0, "lomin": 20.0,  "lamax": 80.0, "lomax": 60.0},
    "Venezuela/Caribbean":   {"lamin": 8.0,  "lomin": -75.0, "lamax": 18.0, "lomax": -60.0},
    "Syria/Iraq":            {"lamin": 29.0, "lomin": 36.0,  "lamax": 37.5, "lomax": 48.0},
    "Afghanistan/Pakistan":  {"lamin": 25.0, "lomin": 60.0,  "lamax": 38.0, "lomax": 74.0},
    "North Africa Sahel":    {"lamin": 12.0, "lomin": -5.0,  "lamax": 20.0, "lomax": 25.0},
}

INTERESTING_SQUAWKS = {"7500": "HIJACK", "7600": "RADIO FAILURE", "7700": "EMERGENCY"}

ZONE_COOLDOWN = 3600
MILITARY_COOLDOWN = 1800
SQUAWK_COOLDOWN = 600


class FlightTrackerSource(BaseSource):
    name = "flight_tracker"
    interval = max(settings.flight_scan_interval or 120, 120)
    credibility = 9.0

    def __init__(self):
        super().__init__()
        self._seen_military: dict[str, float] = {}
        self._seen_squawks: dict[str, float] = {}
        self._seen_zones: dict[str, float] = {}

    async def fetch(self) -> list[RawEvent]:
        now = datetime.now(timezone.utc).timestamp()
        self._prune_caches(now)

        async with httpx.AsyncClient(timeout=30) as client:
            aircraft = await self._fetch_best_source(client)

        if not aircraft:
            return []

        # ── STRATEGIC FILTER: keep all strategic + sample of civilians ──
        raw_count = len(aircraft)
        strategic = []
        civilians = []
        for ac in aircraft:
            relevance = self._classify_relevance(ac)
            ac["_relevance"] = relevance
            if relevance == "civilian":
                civilians.append(ac)
            else:
                strategic.append(ac)

        # Keep a random sample of civilians (up to 500) for globe coverage
        max_civilian = 500
        if len(civilians) > max_civilian:
            civilians = random.sample(civilians, max_civilian)

        logger.info(
            f"FlightTracker: {raw_count} raw → {len(strategic)} strategic "
            f"+ {len(civilians)} civilian sample"
        )
        aircraft = strategic + civilians

        events: list[RawEvent] = []
        zone_counts: dict[str, dict] = {z: {"total": 0, "military": 0} for z in SENSITIVE_ZONES}

        async with async_session() as db:
            for ac in aircraft:
                lat = ac.get("lat")
                lon = ac.get("lon")
                if lat is None or lon is None:
                    continue

                icao24 = str(ac.get("icao24") or ac.get("hex") or "").lower()
                callsign = str(ac.get("callsign") or ac.get("flight") or "").strip()
                aircraft_type = str(ac.get("aircraft_type") or ac.get("t") or "")
                origin_country = str(ac.get("origin_country") or "")

                altitude = _normalize_altitude(ac)
                velocity = _normalize_velocity(ac)
                heading = ac.get("heading") or ac.get("track")
                vertical_rate = ac.get("vertical_rate") or _ft_min_to_ms(ac.get("baro_rate"))
                squawk = str(ac.get("squawk") or "")

                is_military = self._is_military(callsign, aircraft_type)
                is_government = callsign.upper().startswith(("SAM", "EXEC", "AIR1", "AIR2"))
                relevance = ac.get("_relevance", "zone")

                track = FlightTrack(
                    icao24=icao24 or "000000",
                    callsign=callsign or None,
                    aircraft_type=aircraft_type or None,
                    origin_country=origin_country or None,
                    position=WKTElement(f"POINT({lon} {lat})", srid=4326),
                    altitude=altitude,
                    velocity=velocity,
                    heading=heading,
                    vertical_rate=vertical_rate,
                    squawk=squawk or None,
                    is_military=is_military,
                    is_government=is_government,
                )
                db.add(track)

                zone = self._check_zone(lat, lon)
                if zone:
                    zone_counts[zone]["total"] += 1
                    if is_military:
                        zone_counts[zone]["military"] += 1

                # Squawk alert (highest priority)
                if squawk in INTERESTING_SQUAWKS:
                    key = f"{callsign or icao24}:{squawk}"
                    if key not in self._seen_squawks:
                        self._seen_squawks[key] = now
                        zone_info = f" over {zone}" if zone else f" ({origin_country})"
                        events.append(RawEvent(
                            source="adsb",
                            text=f"ALERT: Aircraft {callsign or icao24} squawking {squawk} "
                                 f"({INTERESTING_SQUAWKS[squawk]}){zone_info}",
                            latitude=lat, longitude=lon, credibility=10.0,
                            metadata={"squawk": squawk, "callsign": callsign, "icao24": icao24,
                                      "type": "squawk_alert", "zone": zone},
                        ))

                # Military aircraft event
                if is_military and callsign:
                    if callsign not in self._seen_military:
                        self._seen_military[callsign] = now
                        zone_info = f" in {zone}" if zone else f" ({origin_country})"
                        severity_boost = 1.0 if zone else 0.0
                        events.append(RawEvent(
                            source="adsb",
                            text=f"Military aircraft {callsign}{zone_info}"
                                 + (f" [{aircraft_type}]" if aircraft_type else ""),
                            latitude=lat, longitude=lon,
                            credibility=8.5 + severity_boost,
                            metadata={"callsign": callsign, "icao24": icao24,
                                      "is_military": True, "zone": zone,
                                      "aircraft_type": aircraft_type,
                                      "type": "military_flight"},
                        ))

                # Heavy cargo in sensitive zone
                if relevance == "cargo" and zone and callsign:
                    if callsign not in self._seen_military:
                        self._seen_military[callsign] = now
                        events.append(RawEvent(
                            source="adsb",
                            text=f"Heavy cargo aircraft {callsign} in {zone}"
                                 + (f" [{aircraft_type}]" if aircraft_type else ""),
                            latitude=lat, longitude=lon,
                            credibility=6.5,
                            metadata={"callsign": callsign, "icao24": icao24,
                                      "is_cargo": True, "zone": zone,
                                      "aircraft_type": aircraft_type,
                                      "type": "cargo_flight"},
                        ))

            await db.commit()

        zone_events = self._generate_zone_events(zone_counts, now)
        events.extend(zone_events)

        try:
            await emit_event("tracking", "tracking_update",
                             {"type": "flights", "count": len(aircraft)})
        except Exception as e:
            logger.warning(f"Failed to emit flight tracking update: {e}")

        logger.info(f"FlightTracker: {len(aircraft)} stored, {len(events)} events generated")
        return events

    def _classify_relevance(self, ac: dict) -> str:
        """Classify aircraft relevance. Returns category or 'skip' for civilian."""
        callsign = str(ac.get("callsign") or ac.get("flight") or "").strip().upper()
        aircraft_type = str(ac.get("aircraft_type") or ac.get("t") or "").upper()
        squawk = str(ac.get("squawk") or "")
        lat = ac.get("lat")
        lon = ac.get("lon")

        # Emergency squawks — always keep
        if squawk in INTERESTING_SQUAWKS:
            return "emergency"

        # Military callsigns/types — always keep
        if self._is_military(callsign, aircraft_type):
            return "military"

        # Government flights — always keep
        if callsign.startswith(("SAM", "EXEC", "AIR1", "AIR2")):
            return "government"

        # adsb.fi dbFlags: bit 0 = military, bit 1 = interesting
        db_flags = ac.get("dbFlags", 0)
        if isinstance(db_flags, int) and db_flags & 1:
            return "military"

        # Heavy cargo callsigns — always keep
        for prefix in CARGO_CALLSIGN_PREFIXES:
            if callsign.startswith(prefix):
                return "cargo"

        # Heavy cargo aircraft types — always keep
        if aircraft_type:
            for cargo_type in CARGO_AIRCRAFT_TYPES:
                if aircraft_type.startswith(cargo_type):
                    return "cargo"

        # Anything in a sensitive zone — keep
        if lat is not None and lon is not None:
            if self._check_zone(lat, lon):
                return "zone"

        # Civilian airliners, GA, etc. — kept as sample for coverage
        return "civilian"

    async def _fetch_best_source(self, client: httpx.AsyncClient) -> list[dict]:
        """Try sources in priority order, return first successful result."""
        aircraft = await self._fetch_opensky(client)
        if aircraft:
            logger.info(f"FlightTracker: using OpenSky ({len(aircraft)} aircraft)")
            return aircraft

        aircraft = await self._fetch_adsbfi(client)
        if aircraft:
            logger.info(f"FlightTracker: using adsb.fi ({len(aircraft)} aircraft)")
            return aircraft

        aircraft = await self._fetch_adsblol(client)
        if aircraft:
            logger.info(f"FlightTracker: using adsb.lol ({len(aircraft)} aircraft)")
            return aircraft

        if settings.adsb_exchange_api_key:
            aircraft = await self._fetch_adsbexchange(client)
            if aircraft:
                logger.info(f"FlightTracker: using ADS-B Exchange ({len(aircraft)} aircraft)")
                return aircraft

        logger.info("FlightTracker: ALL sources failed — no aircraft data available")
        return []

    async def _fetch_adsbfi(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            resp = await client.get(ADSBFI_URL, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                return [_normalize_adsbfi(ac) for ac in data.get("aircraft", [])
                        if ac.get("lat") and ac.get("lon")]
        except Exception as e:
            logger.debug(f"adsb.fi failed: {e}")
        return []

    async def _fetch_adsblol(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            resp = await client.get(ADSBLOL_URL, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                return [_normalize_adsbfi(ac) for ac in data.get("aircraft", [])
                        if ac.get("lat") and ac.get("lon")]
        except Exception as e:
            logger.debug(f"adsb.lol failed: {e}")
        return []

    async def _fetch_adsbexchange(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            headers = {
                "X-RapidAPI-Key": settings.adsb_exchange_api_key,
                "X-RapidAPI-Host": "adsbexchange-com1.p.rapidapi.com",
            }
            resp = await client.get(ADSBEXCHANGE_URL, headers=headers, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                return [_normalize_adsbfi(ac) for ac in data.get("ac", [])
                        if ac.get("lat") and ac.get("lon")]
        except Exception as e:
            logger.debug(f"ADS-B Exchange failed: {e}")
        return []

    async def _fetch_opensky(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            # Try with auth first, fall back to unauthenticated if 401
            kwargs: dict = {"timeout": 30}
            if settings.opensky_username and settings.opensky_password:
                kwargs["auth"] = (settings.opensky_username, settings.opensky_password)
            resp = await client.get(OPENSKY_URL, **kwargs)
            if resp.status_code == 401 and "auth" in kwargs:
                logger.info("OpenSky auth rejected (401), retrying without credentials")
                del kwargs["auth"]
                resp = await client.get(OPENSKY_URL, **kwargs)
            if resp.status_code == 200:
                data = resp.json()
                result = []
                for state in (data.get("states") or []):
                    if len(state) < 17 or state[5] is None or state[6] is None:
                        continue
                    result.append({
                        "icao24": state[0] or "",
                        "callsign": (state[1] or "").strip(),
                        "origin_country": state[2] or "",
                        "lon": state[5], "lat": state[6],
                        "altitude_m": state[7],
                        "velocity_ms": state[9],
                        "heading": state[10],
                        "vertical_rate": state[11],
                        "squawk": state[14] if len(state) > 14 else None,
                        "aircraft_type": "",
                        "_opensky": True,
                    })
                return result
            if resp.status_code == 429:
                logger.warning("OpenSky rate-limited (429)")
        except Exception as e:
            logger.warning(f"OpenSky failed: {e}")
        return []

    def _is_military(self, callsign: str, aircraft_type: str = "") -> bool:
        cs = callsign.upper() if callsign else ""
        for prefix in MILITARY_CALLSIGN_PREFIXES:
            if cs.startswith(prefix):
                return True
        if aircraft_type:
            t = aircraft_type.upper()
            for mil_type in MILITARY_AIRCRAFT_TYPES:
                if t.startswith(mil_type):
                    return True
        return False

    def _check_zone(self, lat: float, lon: float) -> str | None:
        for name, bbox in SENSITIVE_ZONES.items():
            if (bbox["lamin"] <= lat <= bbox["lamax"] and
                    bbox["lomin"] <= lon <= bbox["lomax"]):
                return name
        return None

    def _generate_zone_events(self, zone_counts: dict, now: float) -> list[RawEvent]:
        events = []
        for zone_name, counts in zone_counts.items():
            total = counts["total"]
            military = counts["military"]
            if total < 3 and military == 0:
                continue
            key = f"zone:{zone_name}"
            if now - self._seen_zones.get(key, 0) < ZONE_COOLDOWN:
                continue
            self._seen_zones[key] = now
            bbox = SENSITIVE_ZONES[zone_name]
            lat = (bbox["lamin"] + bbox["lamax"]) / 2
            lon = (bbox["lomin"] + bbox["lomax"]) / 2
            credibility = 8.0 if military >= 2 else (6.0 if military == 1 else 4.5)
            events.append(RawEvent(
                source="adsb",
                text=f"Airspace activity — {zone_name}: {total} aircraft"
                     + (f" including {military} military" if military else ""),
                latitude=lat, longitude=lon, credibility=credibility,
                metadata={"zone": zone_name, "total_aircraft": total,
                          "military_aircraft": military, "type": "zone_activity"},
            ))
        return events

    def _prune_caches(self, now: float) -> None:
        self._seen_military = {k: v for k, v in self._seen_military.items()
                               if now - v < MILITARY_COOLDOWN}
        self._seen_squawks = {k: v for k, v in self._seen_squawks.items()
                              if now - v < SQUAWK_COOLDOWN}
        self._seen_zones = {k: v for k, v in self._seen_zones.items()
                            if now - v < ZONE_COOLDOWN * 2}


# ── Normalization helpers ──────────────────────────────────────────────────────

def _normalize_adsbfi(ac: dict) -> dict:
    """Convert adsb.fi / adsb.lol / ADS-B Exchange aircraft dict to common format."""
    return {
        "icao24": str(ac.get("hex") or ac.get("icao24") or ""),
        "callsign": str(ac.get("flight") or ac.get("callsign") or "").strip(),
        "aircraft_type": str(ac.get("t") or ac.get("type") or ac.get("aircraft_type") or ""),
        "origin_country": str(ac.get("r") or ""),
        "lat": ac.get("lat"),
        "lon": ac.get("lon"),
        "alt_ft": ac.get("alt_geom") or ac.get("alt_baro"),
        "gs": ac.get("gs"),
        "heading": ac.get("track") or ac.get("true_heading") or ac.get("mag_heading"),
        "baro_rate": ac.get("baro_rate"),
        "squawk": str(ac.get("squawk") or ""),
        "emergency": str(ac.get("emergency") or ""),
        "dbFlags": ac.get("dbFlags", 0),
    }


def _normalize_altitude(ac: dict) -> float | None:
    if ac.get("altitude_m") is not None:
        return ac["altitude_m"]
    alt_ft = ac.get("alt_ft")
    if isinstance(alt_ft, (int, float)) and alt_ft > -1000:
        return alt_ft * 0.3048
    return None


def _normalize_velocity(ac: dict) -> float | None:
    if ac.get("velocity_ms") is not None:
        return ac["velocity_ms"]
    gs = ac.get("gs")
    if isinstance(gs, (int, float)):
        return gs * 0.514444
    return None


def _ft_min_to_ms(val) -> float | None:
    if isinstance(val, (int, float)):
        return val * 0.00508
    return None
