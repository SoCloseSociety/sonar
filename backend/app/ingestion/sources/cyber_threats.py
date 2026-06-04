"""Cyber Threat Intelligence — monitors CVEs, breaches, and nation-state cyber ops."""
import logging
import re
from datetime import datetime, timezone

import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

# Cyber threat intelligence feeds
CYBER_FEEDS = [
    # Official Government Cyber
    {
        "name": "CISA Advisories",
        "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml",
        "cred": 9.5,
    },
    {
        "name": "US-CERT Alerts",
        "url": "https://www.us-cert.gov/ncas/alerts.xml",
        "cred": 9.5,
    },
    # Threat Intelligence
    {
        "name": "Recorded Future",
        "url": "https://www.recordedfuture.com/feed",
        "cred": 8.0,
    },
    {
        "name": "Mandiant/Google TAG",
        "url": "https://blog.google/threat-analysis-group/rss/",
        "cred": 9.0,
    },
    {
        "name": "Microsoft Threat Intel",
        "url": "https://www.microsoft.com/en-us/security/blog/feed/",
        "cred": 8.5,
    },
    {
        "name": "Krebs on Security",
        "url": "https://krebsonsecurity.com/feed/",
        "cred": 8.5,
    },
    {
        "name": "The Hacker News",
        "url": "https://feeds.feedburner.com/TheHackersNews",
        "cred": 7.0,
    },
    {
        "name": "BleepingComputer",
        "url": "https://www.bleepingcomputer.com/feed/",
        "cred": 7.5,
    },
    {
        "name": "Dark Reading",
        "url": "https://www.darkreading.com/rss.xml",
        "cred": 7.0,
    },
    {
        "name": "Schneier on Security",
        "url": "https://www.schneier.com/feed/",
        "cred": 8.5,
    },
    # Exploit / Vuln Tracking
    {
        "name": "Exploit-DB",
        "url": "https://www.exploit-db.com/rss.xml",
        "cred": 8.0,
    },
]

_ITEM_RE = re.compile(r"<item>(.*?)</item>", re.DOTALL)
_ENTRY_RE = re.compile(r"<entry>(.*?)</entry>", re.DOTALL)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL)
_LINK_RE = re.compile(r"<link[^>]*(?:href=[\"']([^\"']+)[\"']|>(.*?)</link>)", re.DOTALL)
_DESC_RE = re.compile(r"<description>(.*?)</description>", re.DOTALL)
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)

# Keywords that indicate a geopolitically relevant cyber event
GEO_KEYWORDS = re.compile(
    r"(?:nation.state|APT\d|state.sponsored|china|russia|iran|north.korea|"
    r"critical.infrastructure|power.grid|water.system|hospital|pipeline|"
    r"election|government|military|espionage|zero.day|ransomware.attack|"
    r"cyberwar|information.warfare|DDoS.attack|supply.chain)",
    re.IGNORECASE,
)


class CyberThreatSource(BaseSource):
    """
    Monitors cybersecurity threat feeds for geopolitically relevant cyber events.
    Nation-state ops, critical infrastructure attacks, zero-days.
    """

    name = "cyber_threats"
    interval = 600  # 10 minutes
    credibility = 8.0

    def __init__(self):
        super().__init__()
        self._seen: set[str] = set()
        self._client = httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "SONAR/1.0"},
        )

    async def fetch(self) -> list[RawEvent]:
        import asyncio
        events: list[RawEvent] = []

        batch_size = 3
        idx = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(CYBER_FEEDS) // batch_size)
        batch = CYBER_FEEDS[idx * batch_size: (idx + 1) * batch_size]

        tasks = [self._fetch_feed(f) for f in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, list):
                events.extend(r)

        # Also fetch latest CVEs from NVD
        cve_events = await self._fetch_nvd_critical()
        events.extend(cve_events)

        if len(self._seen) > 3000:
            self._seen = set(list(self._seen)[-1000:])

        return events

    async def _fetch_feed(self, feed: dict) -> list[RawEvent]:
        events = []
        try:
            resp = await self._client.get(feed["url"])
            resp.raise_for_status()
            xml = resp.text

            items = _ITEM_RE.findall(xml) or _ENTRY_RE.findall(xml)
            for item_xml in items[:8]:
                title_m = _TITLE_RE.search(item_xml)
                title = _strip(title_m.group(1)) if title_m else ""
                if not title:
                    continue

                link = ""
                link_m = _LINK_RE.search(item_xml)
                if link_m:
                    link = (link_m.group(1) or link_m.group(2) or "").strip()

                key = link or title
                if key in self._seen:
                    continue

                desc = ""
                desc_m = _DESC_RE.search(item_xml)
                if desc_m:
                    desc = _strip(desc_m.group(1))[:400]

                # Filter: only keep geopolitically relevant cyber events
                combined = f"{title} {desc}"
                if not GEO_KEYWORDS.search(combined):
                    continue

                self._seen.add(key)

                text = f"[CYBER/{feed['name']}] {title}"
                if desc:
                    text += f"\n{desc}"

                events.append(RawEvent(
                    source="cyber_threats",
                    text=text,
                    url=link,
                    timestamp=datetime.now(timezone.utc),
                    credibility=feed["cred"],
                    metadata={"feed": feed["name"], "type": "cyber"},
                ))

        except Exception as e:
            logger.debug(f"Cyber feed {feed['name']}: {e}")

        return events

    async def _fetch_nvd_critical(self) -> list[RawEvent]:
        """Fetch critical CVEs from NVD (NIST National Vulnerability Database)."""
        events = []
        try:
            resp = await self._client.get(
                "https://services.nvd.nist.gov/rest/json/cves/2.0",
                params={
                    "cvssV3Severity": "CRITICAL",
                    "resultsPerPage": 5,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                return events

            data = resp.json()
            for vuln in data.get("vulnerabilities", []):
                cve = vuln.get("cve", {})
                cve_id = cve.get("id", "")
                if cve_id in self._seen:
                    continue

                desc_list = cve.get("descriptions", [])
                desc = next((d["value"] for d in desc_list if d.get("lang") == "en"), "")
                if not desc:
                    continue

                # Only report CVEs that affect critical infrastructure
                if not GEO_KEYWORDS.search(desc):
                    continue

                self._seen.add(cve_id)

                events.append(RawEvent(
                    source="cyber_threats",
                    text=f"[CVE/CRITICAL] {cve_id}: {desc[:500]}",
                    url=f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                    timestamp=datetime.now(timezone.utc),
                    credibility=9.0,
                    metadata={"cve_id": cve_id, "type": "cve"},
                ))

        except Exception as e:
            logger.debug(f"NVD fetch: {e}")

        return events


def _strip(s: str) -> str:
    s = _CDATA_RE.sub(r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"&\w+;", " ", s)
    return s.strip()
