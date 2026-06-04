"""Sanctions & Trade Intelligence — monitors sanctions, embargoes, and trade disruptions."""
import logging
import re
from datetime import datetime, timezone

import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

# Sanctions, trade, and economic intelligence feeds
TRADE_FEEDS = [
    {
        "name": "OFAC (US Treasury)",
        "url": "https://ofac.treasury.gov/rss.xml",
        "cred": 9.5,
    },
    {
        "name": "EU Sanctions Map",
        "url": "https://www.sanctionsmap.eu/api/v1/sanctions/rss",
        "cred": 9.0,
    },
    {
        "name": "WTO News",
        "url": "https://www.wto.org/english/news_e/feed.rss",
        "cred": 9.0,
    },
    {
        "name": "Trade.gov Alerts",
        "url": "https://www.trade.gov/rss/trade-news",
        "cred": 8.5,
    },
    {
        "name": "BIS Export Controls",
        "url": "https://www.bis.doc.gov/rss.xml",
        "cred": 9.0,
    },
    {
        "name": "World Bank",
        "url": "https://blogs.worldbank.org/feed",
        "cred": 8.5,
    },
    {
        "name": "IMF News",
        "url": "https://www.imf.org/en/News/Rss?Language=ENG",
        "cred": 9.0,
    },
    {
        "name": "FreightWaves",
        "url": "https://www.freightwaves.com/feed",
        "cred": 7.0,
    },
    {
        "name": "gCaptain (Maritime Trade)",
        "url": "https://gcaptain.com/feed/",
        "cred": 7.5,
    },
    {
        "name": "Lloyd's List",
        "url": "https://lloydslist.maritimeintelligence.informa.com/rss",
        "cred": 8.5,
    },
]

_ITEM_RE = re.compile(r"<item>(.*?)</item>", re.DOTALL)
_ENTRY_RE = re.compile(r"<entry>(.*?)</entry>", re.DOTALL)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL)
_LINK_RE = re.compile(r"<link[^>]*(?:href=[\"']([^\"']+)[\"']|>(.*?)</link>)", re.DOTALL)
_DESC_RE = re.compile(r"<description>(.*?)</description>", re.DOTALL)


class SanctionsTradeSource(BaseSource):
    """
    Monitors sanctions lists, trade disruptions, embargoes, and economic warfare.
    Critical for understanding economic dimensions of geopolitical conflict.
    """

    name = "sanctions_trade"
    interval = 1800  # 30 minutes
    credibility = 8.5

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
        idx = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(TRADE_FEEDS) // batch_size)
        batch = TRADE_FEEDS[idx * batch_size: (idx + 1) * batch_size]

        tasks = [self._fetch_feed(f) for f in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, list):
                events.extend(r)

        if len(self._seen) > 2000:
            self._seen = set(list(self._seen)[-500:])

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

                text = f"[TRADE/{feed['name']}] {title}"
                if desc:
                    text += f"\n{desc}"

                events.append(RawEvent(
                    source="sanctions_trade",
                    text=text,
                    url=link,
                    timestamp=datetime.now(timezone.utc),
                    credibility=feed["cred"],
                    metadata={"feed": feed["name"]},
                ))

        except Exception as e:
            logger.debug(f"Trade feed {feed['name']}: {e}")

        return events


def _strip(s: str) -> str:
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s, flags=re.DOTALL)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"&\w+;", " ", s)
    return s.strip()
