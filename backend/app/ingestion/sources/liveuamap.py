"""LiveUAMap-style Conflict Monitor — tracks active conflict events worldwide."""
import logging
import re
from datetime import datetime, timezone

import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

# Conflict-focused RSS feeds and APIs that provide geolocated conflict data
CONFLICT_FEEDS = [
    # Specialized conflict trackers
    {
        "name": "ACAPS",
        "url": "https://www.acaps.org/en/countries/rss",
        "cred": 8.5,
    },
    {
        "name": "International Crisis Group",
        "url": "https://www.crisisgroup.org/latest-updates/rss",
        "cred": 9.0,
    },
    {
        "name": "Janes Intelligence",
        "url": "https://www.janes.com/feeds/news",
        "cred": 9.0,
    },
    {
        "name": "DefenseOne",
        "url": "https://www.defenseone.com/rss/",
        "cred": 7.5,
    },
    {
        "name": "War on the Rocks",
        "url": "https://warontherocks.com/feed/",
        "cred": 8.0,
    },
    {
        "name": "The War Zone (Drive)",
        "url": "https://www.thedrive.com/the-war-zone/feed",
        "cred": 7.5,
    },
    {
        "name": "Bellingcat",
        "url": "https://www.bellingcat.com/feed/",
        "cred": 8.5,
    },
    {
        "name": "Airwars",
        "url": "https://airwars.org/feed/",
        "cred": 8.0,
    },
    {
        "name": "Oryx (Military Losses)",
        "url": "https://www.oryxspioenkop.com/feeds/posts/default?alt=rss",
        "cred": 8.5,
    },
    {
        "name": "Arms Control Association",
        "url": "https://www.armscontrol.org/rss.xml",
        "cred": 9.0,
    },
    {
        "name": "Bulletin of Atomic Scientists",
        "url": "https://thebulletin.org/feed/",
        "cred": 9.0,
    },
    {
        "name": "Foreign Policy",
        "url": "https://foreignpolicy.com/feed/",
        "cred": 8.0,
    },
    {
        "name": "The Diplomat",
        "url": "https://thediplomat.com/feed/",
        "cred": 7.5,
    },
    {
        "name": "Asia Times",
        "url": "https://asiatimes.com/feed/",
        "cred": 7.0,
    },
    {
        "name": "Middle East Eye",
        "url": "https://www.middleeasteye.net/rss",
        "cred": 7.0,
    },
]

_ITEM_RE = re.compile(r"<item>(.*?)</item>", re.DOTALL)
_ENTRY_RE = re.compile(r"<entry>(.*?)</entry>", re.DOTALL)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL)
_LINK_RE = re.compile(r"<link[^>]*(?:href=[\"']([^\"']+)[\"']|>(.*?)</link>)", re.DOTALL)
_DESC_RE = re.compile(r"<description>(.*?)</description>", re.DOTALL)
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)


class ConflictMonitorSource(BaseSource):
    """
    Aggregates specialized conflict, defense, and geopolitical analysis feeds.
    Combines think tanks, investigative outlets, and conflict trackers.
    """

    name = "conflict_monitor"
    interval = 900  # 15 minutes
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

        # 3 feeds per cycle
        batch_size = 3
        idx = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(CONFLICT_FEEDS) // batch_size)
        batch = CONFLICT_FEEDS[idx * batch_size: (idx + 1) * batch_size]

        tasks = [self._fetch_feed(f) for f in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, list):
                events.extend(r)

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
                self._seen.add(key)

                desc = ""
                desc_m = _DESC_RE.search(item_xml)
                if desc_m:
                    desc = _strip(desc_m.group(1))[:400]

                text = f"[{feed['name']}] {title}"
                if desc:
                    text += f"\n{desc}"

                events.append(RawEvent(
                    source="conflict_monitor",
                    text=text,
                    url=link,
                    timestamp=datetime.now(timezone.utc),
                    credibility=feed["cred"],
                    metadata={"feed": feed["name"]},
                ))

        except Exception as e:
            logger.debug(f"Conflict feed {feed['name']}: {e}")

        return events


def _strip(s: str) -> str:
    s = _CDATA_RE.sub(r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"&\w+;", " ", s)
    return s.strip()
