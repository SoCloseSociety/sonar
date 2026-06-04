"""Shodan Monitor — tracks exposed ICS/SCADA, military, and critical infrastructure systems."""
import logging
from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)
settings = get_settings()

# Shodan search queries for geopolitically relevant targets
SHODAN_QUERIES = [
    # Industrial Control Systems (ICS/SCADA)
    {"query": "port:502 modbus", "label": "Modbus ICS", "severity": "high"},
    {"query": "port:102 s7comm", "label": "Siemens S7 PLC", "severity": "critical"},
    {"query": "port:44818 ethernet/ip", "label": "EtherNet/IP ICS", "severity": "high"},
    {"query": "port:47808 bacnet", "label": "BACnet Building", "severity": "medium"},
    {"query": "port:20000 dnp3", "label": "DNP3 SCADA", "severity": "critical"},
    # Critical Infrastructure
    {"query": '"power plant" port:80,443', "label": "Power Plant Web", "severity": "high"},
    {"query": '"water treatment" port:80', "label": "Water Treatment", "severity": "critical"},
    {"query": "tag:ics country:UA", "label": "Ukraine ICS", "severity": "critical"},
    {"query": "tag:ics country:RU", "label": "Russia ICS", "severity": "high"},
    {"query": "tag:ics country:IR", "label": "Iran ICS", "severity": "high"},
    {"query": "tag:ics country:CN", "label": "China ICS", "severity": "high"},
    {"query": "tag:ics country:TW", "label": "Taiwan ICS", "severity": "high"},
    # Military & Government
    {"query": "org:military", "label": "Military Networks", "severity": "high"},
    {"query": "org:navy", "label": "Naval Networks", "severity": "high"},
    {"query": "org:air force", "label": "Air Force Networks", "severity": "high"},
    {"query": '"ministry of defense"', "label": "MoD Systems", "severity": "high"},
    # Satellite & Comms
    {"query": "port:5060 sip country:SY", "label": "Syria VoIP", "severity": "medium"},
    {"query": "product:satellite", "label": "Satellite Systems", "severity": "high"},
    # Nuclear-related
    {"query": '"nuclear" port:80,443 tag:ics', "label": "Nuclear Facility", "severity": "critical"},
    {"query": "org:iaea", "label": "IAEA Systems", "severity": "high"},
    # Cameras (OSINT value)
    {"query": "webcam country:UA", "label": "Ukraine Webcams", "severity": "low"},
    {"query": "webcam country:IL", "label": "Israel Webcams", "severity": "low"},
    {"query": "webcam has_screenshot:true country:SY", "label": "Syria Cameras", "severity": "low"},
]


class ShodanMonitorSource(BaseSource):
    """
    Shodan integration for monitoring exposed ICS/SCADA systems, military networks,
    and critical infrastructure. Provides cyber-physical intelligence layer.
    """

    name = "shodan"
    interval = 3600  # 1 hour (API rate limits)
    credibility = 8.5

    def __init__(self):
        super().__init__()
        self._seen: set[str] = set()
        self._client = httpx.AsyncClient(timeout=30, follow_redirects=True)
        self._query_idx = 0

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []

        if not settings.shodan_api_key:
            return events

        # Rotate through 3 queries per cycle (rate limit friendly)
        batch = []
        for _ in range(3):
            batch.append(SHODAN_QUERIES[self._query_idx % len(SHODAN_QUERIES)])
            self._query_idx += 1

        for q in batch:
            try:
                results = await self._search(q["query"])
                for r in results:
                    event = self._parse_result(r, q)
                    if event:
                        events.append(event)
            except Exception as e:
                logger.debug(f"Shodan query '{q['label']}': {e}")

        # Also check alerts if configured
        alert_events = await self._fetch_alerts()
        events.extend(alert_events)

        if len(self._seen) > 5000:
            self._seen = set(list(self._seen)[-2000:])

        return events

    async def _search(self, query: str) -> list[dict]:
        """Execute a Shodan search query."""
        resp = await self._client.get(
            "https://api.shodan.io/shodan/host/search",
            params={
                "key": settings.shodan_api_key,
                "query": query,
                "minify": True,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("matches", [])[:20]

    def _parse_result(self, result: dict, query_cfg: dict) -> RawEvent | None:
        """Parse a single Shodan result into a RawEvent."""
        ip = result.get("ip_str", "")
        port = result.get("port", 0)
        org = result.get("org", "Unknown")
        product = result.get("product", "")
        country = result.get("location", {}).get("country_name", "")
        country_code = result.get("location", {}).get("country_code", "")
        city = result.get("location", {}).get("city", "")
        lat = result.get("location", {}).get("latitude")
        lon = result.get("location", {}).get("longitude")

        # Dedup by IP:port
        key = f"{ip}:{port}"
        if key in self._seen:
            return None
        self._seen.add(key)

        severity_label = query_cfg.get("severity", "medium")
        label = query_cfg["label"]

        loc_str = f"{city}, {country}" if city else country

        text = (
            f"[Shodan/{label}] Exposed {product or 'service'} on {ip}:{port} "
            f"({org}) in {loc_str}"
        )

        if severity_label == "critical":
            text = f"[CRITICAL] {text}"
            cred = 9.0
        elif severity_label == "high":
            cred = 8.0
        else:
            cred = 7.0

        return RawEvent(
            source="shodan",
            text=text,
            latitude=lat,
            longitude=lon,
            country=country_code,
            timestamp=datetime.now(timezone.utc),
            credibility=cred,
            metadata={
                "ip": ip,
                "port": port,
                "org": org,
                "product": product,
                "query_label": label,
                "severity": severity_label,
            },
        )

    async def _fetch_alerts(self) -> list[RawEvent]:
        """Fetch Shodan network alerts (if any configured)."""
        events = []
        try:
            resp = await self._client.get(
                "https://api.shodan.io/shodan/alert/info",
                params={"key": settings.shodan_api_key},
            )
            if resp.status_code != 200:
                return events

            alerts = resp.json()
            for alert in alerts[:10]:
                alert_id = alert.get("id", "")
                name = alert.get("name", "")
                triggers = alert.get("triggers", {})

                if f"alert:{alert_id}" in self._seen:
                    continue

                if triggers:
                    self._seen.add(f"alert:{alert_id}")
                    trigger_names = list(triggers.keys())

                    events.append(RawEvent(
                        source="shodan",
                        text=f"[Shodan Alert] {name}: triggers={', '.join(trigger_names)}",
                        timestamp=datetime.now(timezone.utc),
                        credibility=8.0,
                        metadata={"alert_id": alert_id, "triggers": trigger_names},
                    ))

        except Exception as e:
            logger.debug(f"Shodan alerts: {e}")

        return events
