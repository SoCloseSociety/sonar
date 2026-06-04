import logging
import httpx
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_GEO_API = "https://api.gdeltproject.org/api/v2/geo/geo"

# Rotate through these queries — each fetch picks one
GDELT_QUERIES = [
    # Military / Conflict
    "military conflict",
    "missile strike",
    "drone attack",
    "airspace violation",
    "naval deployment",
    "border tensions",
    "military exercise",
    "ceasefire violation",
    # Nuclear / WMD
    "nuclear threat",
    "nuclear test",
    "uranium enrichment",
    "ICBM launch",
    # Political / Instability
    "coup attempt",
    "martial law",
    "sanctions imposed",
    "diplomatic expulsion",
    "election interference",
    "mass protest",
    # Infrastructure / Economic
    "pipeline sabotage",
    "port blockade",
    "cyberattack infrastructure",
    "energy crisis",
    # Terrorism
    "terrorist attack",
    "hostage crisis",
]


class GDELTSource(BaseSource):
    name = "gdelt"
    interval = 600  # 10 minutes
    credibility = 6.0

    def __init__(self):
        super().__init__()
        self._query_index = 0

    async def fetch(self) -> list[RawEvent]:
        events = []

        # Rotate through 3 queries per fetch for broader coverage
        queries_this_round = []
        for _ in range(3):
            queries_this_round.append(GDELT_QUERIES[self._query_index % len(GDELT_QUERIES)])
            self._query_index += 1

        async with httpx.AsyncClient(timeout=45) as client:
            for query in queries_this_round:
                try:
                    # Fetch articles
                    resp = await client.get(GDELT_DOC_API, params={
                        "query": query,
                        "mode": "ArtList",
                        "maxrecords": "25",
                        "format": "json",
                        "timespan": "60min",
                    })

                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    articles = data.get("articles", [])

                    for article in articles:
                        title = article.get("title", "").strip()
                        url = article.get("url", "")
                        source_name = article.get("domain", "")
                        lang = article.get("language", "")

                        if not title:
                            continue
                        if lang and lang not in ("English", ""):
                            continue

                        # Extract lat/lon from GDELT's socialimage geo data if present
                        lat = None
                        lon = None
                        country = ""
                        if "sourcecountry" in article:
                            country = article["sourcecountry"]

                        events.append(RawEvent(
                            source=f"gdelt:{source_name}",
                            text=title,
                            url=url,
                            latitude=lat,
                            longitude=lon,
                            country=country,
                            credibility=6.0,
                            metadata={"gdelt_query": query},
                        ))

                except Exception as e:
                    logger.debug(f"GDELT query '{query}' failed: {e}")

            # Also try GDELT GEO API for geolocated event counts
            try:
                geo_resp = await client.get(GDELT_GEO_API, params={
                    "query": "conflict OR military OR attack",
                    "format": "GeoJSON",
                    "timespan": "60min",
                    "maxpoints": "50",
                })
                if geo_resp.status_code == 200:
                    geo_data = geo_resp.json()
                    for feature in geo_data.get("features", [])[:30]:
                        props = feature.get("properties", {})
                        geom = feature.get("geometry", {})
                        coords = geom.get("coordinates", [])

                        if len(coords) < 2:
                            continue

                        name = props.get("name", "")
                        count = props.get("count", 0)
                        url = props.get("url", "")

                        if count < 3:
                            continue

                        events.append(RawEvent(
                            source="gdelt:geo",
                            text=f"GDELT: {count} articles about conflict near {name}",
                            url=url,
                            latitude=coords[1],
                            longitude=coords[0],
                            credibility=5.5,
                            metadata={"gdelt_geo_count": count, "location_name": name},
                        ))
            except Exception as e:
                logger.debug(f"GDELT GEO API failed: {e}")

        logger.info(f"GDELT collected {len(events)} events from {len(queries_this_round)} queries")
        return events
