"""
Lightweight geocoding for events without coordinates.
Maps country names and common location mentions to approximate centroids.
"""
import re
import logging

logger = logging.getLogger(__name__)

# Country centroids (lat, lng) — covers the most geopolitically relevant countries
COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    # Middle East
    "iran": (32.4, 53.7), "iraq": (33.2, 43.7), "syria": (35.0, 38.5),
    "israel": (31.0, 34.9), "palestine": (31.9, 35.2), "gaza": (31.4, 34.4),
    "lebanon": (33.9, 35.9), "jordan": (31.0, 36.8), "saudi arabia": (24.7, 46.7),
    "yemen": (15.5, 48.5), "oman": (21.5, 57.0), "uae": (24.5, 54.7),
    "qatar": (25.3, 51.2), "bahrain": (26.0, 50.6), "kuwait": (29.3, 47.5),
    # Europe
    "ukraine": (48.4, 31.2), "russia": (55.8, 37.6), "germany": (51.2, 10.5),
    "france": (46.6, 2.2), "uk": (51.5, -0.1), "united kingdom": (51.5, -0.1),
    "britain": (51.5, -0.1), "poland": (52.0, 19.4), "romania": (44.4, 26.1),
    "turkey": (39.9, 32.9), "greece": (39.1, 21.8), "italy": (41.9, 12.5),
    "spain": (40.5, -3.7), "netherlands": (52.1, 5.3), "belgium": (50.8, 4.4),
    "sweden": (60.1, 18.6), "norway": (60.5, 8.5), "finland": (61.9, 25.7),
    "estonia": (58.6, 25.0), "latvia": (56.9, 24.1), "lithuania": (55.2, 24.0),
    "moldova": (47.0, 28.9), "belarus": (53.7, 27.6), "serbia": (44.0, 21.0),
    "kosovo": (42.6, 21.2), "bosnia": (43.9, 17.7), "croatia": (45.1, 15.2),
    "czech republic": (49.8, 15.5), "slovakia": (48.7, 19.7), "hungary": (47.2, 19.5),
    "austria": (47.5, 14.6), "switzerland": (46.8, 8.2), "portugal": (39.4, -8.2),
    "denmark": (56.3, 9.5), "iceland": (64.1, -21.9), "ireland": (53.1, -7.7),
    "georgia": (42.3, 43.4), "armenia": (40.1, 44.5), "azerbaijan": (40.1, 47.6),
    "cyprus": (35.1, 33.4), "albania": (41.2, 20.2), "montenegro": (42.7, 19.4),
    "north macedonia": (41.5, 21.7), "bulgaria": (42.7, 25.5), "slovenia": (46.2, 14.8),
    # Asia
    "china": (35.9, 104.2), "japan": (36.2, 138.3), "south korea": (35.9, 127.8),
    "north korea": (40.3, 127.5), "taiwan": (23.7, 121.0), "india": (20.6, 79.0),
    "pakistan": (30.4, 69.3), "afghanistan": (33.9, 67.7), "bangladesh": (23.7, 90.4),
    "myanmar": (19.8, 96.0), "thailand": (15.9, 100.9), "vietnam": (14.1, 108.3),
    "philippines": (12.9, 122.0), "indonesia": (-0.8, 113.9), "malaysia": (4.2, 101.9),
    "singapore": (1.4, 103.8), "cambodia": (12.6, 105.0), "laos": (19.9, 102.5),
    "mongolia": (46.9, 103.8), "nepal": (28.4, 84.1), "sri lanka": (7.9, 80.8),
    # Africa
    "egypt": (26.8, 30.8), "libya": (26.3, 17.2), "tunisia": (34.0, 9.5),
    "algeria": (28.0, 1.7), "morocco": (31.8, -7.1), "sudan": (12.9, 30.2),
    "south sudan": (6.9, 31.3), "ethiopia": (9.1, 40.5), "somalia": (5.2, 46.2),
    "kenya": (-0.0, 37.9), "nigeria": (9.1, 8.7), "south africa": (-30.6, 22.9),
    "dr congo": (-4.0, 21.8), "drc": (-4.0, 21.8), "congo": (-4.3, 15.3),
    "mali": (17.6, -4.0), "niger": (17.6, 8.1), "burkina faso": (12.4, -1.6),
    "cameroon": (7.4, 12.4), "chad": (15.5, 19.0), "central african republic": (6.6, 20.9),
    "mozambique": (-18.7, 35.5), "tanzania": (-6.4, 34.9), "uganda": (1.4, 32.3),
    "rwanda": (-1.9, 29.9), "angola": (-11.2, 17.9), "ghana": (7.9, -1.0),
    "senegal": (14.5, -14.5), "ivory coast": (7.5, -5.5),
    # Americas
    "united states": (39.8, -98.6), "us": (39.8, -98.6), "usa": (39.8, -98.6),
    "canada": (56.1, -106.3), "mexico": (23.6, -102.6),
    "brazil": (-14.2, -51.9), "colombia": (4.6, -74.3), "venezuela": (6.4, -66.6),
    "argentina": (-38.4, -63.6), "chile": (-35.7, -71.5), "peru": (-9.2, -75.0),
    "cuba": (21.5, -77.8), "haiti": (19.1, -72.3), "guatemala": (15.8, -90.2),
    "honduras": (15.2, -86.2), "el salvador": (13.8, -88.9), "nicaragua": (12.9, -85.2),
    "panama": (8.5, -80.8), "ecuador": (-1.8, -78.2), "bolivia": (-16.3, -63.6),
    "paraguay": (-23.4, -58.4), "uruguay": (-32.5, -55.8),
    # Oceania
    "australia": (-25.3, 133.8), "new zealand": (-40.9, 174.9),
}

# City/region to coordinates for common hotspots
HOTSPOT_COORDS: dict[str, tuple[float, float]] = {
    "kyiv": (50.4, 30.5), "kiev": (50.4, 30.5), "moscow": (55.8, 37.6),
    "beijing": (39.9, 116.4), "taipei": (25.0, 121.5), "tehran": (35.7, 51.4),
    "jerusalem": (31.8, 35.2), "tel aviv": (32.1, 34.8), "washington": (38.9, -77.0),
    "brussels": (50.8, 4.4), "london": (51.5, -0.1), "paris": (48.9, 2.4),
    "berlin": (52.5, 13.4), "kabul": (34.5, 69.2), "islamabad": (33.7, 73.1),
    "new delhi": (28.6, 77.2), "pyongyang": (39.0, 125.7), "seoul": (37.6, 127.0),
    "tokyo": (35.7, 139.7), "riyadh": (24.7, 46.7), "dubai": (25.3, 55.3),
    "doha": (25.3, 51.5), "ankara": (39.9, 32.9), "istanbul": (41.0, 28.98),
    "cairo": (30.0, 31.2), "khartoum": (15.6, 32.5), "tripoli": (32.9, 13.2),
    "baghdad": (33.3, 44.4), "damascus": (33.5, 36.3), "beirut": (33.9, 35.5),
    "amman": (31.9, 35.9), "sana'a": (15.4, 44.2), "mogadishu": (2.0, 45.3),
    "nairobi": (-1.3, 36.8), "lagos": (6.5, 3.4), "johannesburg": (-26.2, 28.0),
    "taipei strait": (24.5, 119.5), "taiwan strait": (24.5, 119.5),
    "south china sea": (12.0, 115.0), "strait of hormuz": (26.5, 56.3),
    "suez canal": (30.5, 32.3), "red sea": (20.0, 38.5),
    "black sea": (43.2, 34.3), "baltic sea": (57.7, 19.8),
    "donbas": (48.0, 38.0), "donetsk": (48.0, 37.8), "crimea": (44.9, 34.1),
    "kherson": (46.6, 32.6), "zaporizhzhia": (47.8, 35.2), "odesa": (46.5, 30.7),
    "kharkiv": (49.99, 36.25), "bakhmut": (48.6, 38.0), "avdiivka": (48.1, 37.7),
    "pentagon": (38.9, -77.1), "kremlin": (55.8, 37.6),
    "gaza strip": (31.4, 34.4), "west bank": (31.9, 35.3), "golan": (33.0, 35.8),
    "rafah": (31.3, 34.2), "khan younis": (31.3, 34.3),
    "nato": (50.9, 4.4), "eu": (50.8, 4.4), "un": (40.7, -74.0),
    "hormuz": (26.5, 56.3), "malacca": (2.5, 101.5),
    # Additional cities & hotspots
    "mumbai": (19.1, 72.9), "shanghai": (31.2, 121.5), "hong kong": (22.3, 114.2),
    "addis ababa": (9.0, 38.7), "abuja": (9.1, 7.5), "pretoria": (-25.7, 28.2),
    "kinshasa": (-4.3, 15.3), "luanda": (-8.8, 13.2), "dar es salaam": (-6.8, 39.3),
    "minsk": (53.9, 27.6), "tbilisi": (41.7, 44.8), "baku": (40.4, 49.9),
    "erbil": (36.2, 44.0), "basra": (30.5, 47.8), "mosul": (36.3, 43.1),
    "aleppo": (36.2, 37.2), "idlib": (35.9, 36.6), "homs": (34.7, 36.7),
    "mariupol": (47.1, 37.5), "sevastopol": (44.6, 33.5), "luhansk": (48.6, 39.3),
    "bucha": (50.5, 30.2), "sumy": (50.9, 34.8), "mykolaiv": (46.97, 32.0),
    "kramatorsk": (48.7, 37.6), "dnipro": (48.5, 35.0), "lviv": (49.8, 24.0),
    "isfahan": (32.7, 51.7), "qom": (34.6, 50.9), "tabriz": (38.1, 46.3),
    "natanz": (33.5, 51.9), "fordow": (34.9, 50.3), "bushehr": (28.9, 50.8),
    "dimona": (31.1, 35.1), "haifa": (32.8, 35.0), "eilat": (29.6, 34.9),
    "kabul airport": (34.6, 69.2), "kandahar": (31.6, 65.7), "herat": (34.3, 62.2),
    "karachi": (24.9, 67.0), "lahore": (31.6, 74.4), "peshawar": (34.0, 71.6),
    "waziristan": (32.3, 69.9), "balochistan": (28.5, 66.5),
    "bab el-mandeb": (12.5, 43.3), "gulf of aden": (12.0, 47.0),
    "strait of gibraltar": (35.9, -5.5), "english channel": (50.5, 0.5),
    "kerch strait": (45.3, 36.6), "bosphorus": (41.1, 29.0),
    "suez": (30.0, 32.6), "aden": (12.8, 45.0), "djibouti": (11.6, 43.1),
    "bangui": (4.4, 18.6), "juba": (4.9, 31.6), "mogadishu port": (2.0, 45.3),
    "sochi": (43.6, 39.7), "vladivostok": (43.1, 131.9), "murmansk": (68.97, 33.1),
    "kaliningrad": (54.7, 20.5), "novosibirsk": (55.0, 82.9),
    "xinjiang": (41.0, 85.0), "tibet": (30.0, 91.0), "kashmir": (34.1, 74.8),
    "aksai chin": (35.0, 79.0), "arunachal": (28.0, 94.0), "ladakh": (34.2, 77.6),
    "south china sea": (12.0, 115.0), "spratly": (10.0, 114.0),
    "paracel": (16.5, 112.0), "senkaku": (25.7, 123.5),
    "guam": (13.4, 144.8), "okinawa": (26.3, 127.8), "diego garcia": (-7.3, 72.4),
    "arctic": (90.0, 0.0), "svalbard": (78.0, 16.0),
    "havana": (23.1, -82.4), "caracas": (10.5, -66.9), "bogota": (4.7, -74.1),
    "lima": (-12.0, -77.0), "santiago": (-33.4, -70.6),
    "middle east": (29.0, 42.0), "sahel": (14.0, 0.0), "horn of africa": (8.0, 46.0),
}

# Patterns to extract locations from text
LOCATION_PATTERNS = [
    # "in <Location>" pattern
    r'\bin\s+((?:the\s+)?(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))',
    # "<Location> says/warns/attacks/strikes" pattern
    r'((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))\s+(?:says?|warns?|attacks?|strikes?|launches?|fires?)',
    # Country references in brackets
    r'\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\]',
]


def geocode_event(text: str, country: str | None = None) -> tuple[float, float] | None:
    """
    Try to extract coordinates from event text or country.
    Returns (lat, lng) or None.
    """
    text_lower = text.lower() if text else ""

    # 1. Check for known hotspot mentions in text
    for hotspot, coords in HOTSPOT_COORDS.items():
        if hotspot in text_lower:
            return coords

    # 2. Check country field
    if country:
        country_lower = country.lower().strip()
        if country_lower in COUNTRY_CENTROIDS:
            return COUNTRY_CENTROIDS[country_lower]

    # 3. Check text for country mentions
    for country_name, coords in COUNTRY_CENTROIDS.items():
        # Match whole word (avoid "us" matching everywhere)
        if len(country_name) <= 2:
            # Short names need exact word boundary
            if re.search(rf'\b{re.escape(country_name.upper())}\b', text):
                return coords
        elif country_name in text_lower:
            return coords

    return None


def reverse_geocode_country(lat: float, lng: float) -> str | None:
    """Find the closest country to given coordinates. Returns country name or None."""
    import math
    best_name = None
    best_dist = float('inf')
    for name, (clat, clng) in COUNTRY_CENTROIDS.items():
        # Skip short/ambiguous names
        if len(name) <= 2:
            continue
        # Approximate great-circle distance (good enough for nearest-country matching)
        dlat = lat - clat
        dlng = (lng - clng) * math.cos(math.radians(lat))
        dist = dlat * dlat + dlng * dlng
        if dist < best_dist:
            best_dist = dist
            best_name = name
    # Only return if reasonably close (within ~15 degrees)
    if best_dist < 225:  # 15^2
        return best_name.title() if best_name else None
    return None
