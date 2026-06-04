"""Government & International Organization Feeds — authoritative OSINT sources."""
import asyncio
import logging
import re
from datetime import datetime, timezone

import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

# Authoritative government and IO data feeds
GOV_FEEDS = [
    # UN System
    {
        "name": "UN News",
        "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
        "cred": 9.0,
        "type": "rss",
    },
    {
        "name": "WHO Emergencies",
        "url": "https://www.who.int/feeds/entity/emergencies/en/rss.xml",
        "cred": 9.5,
        "type": "rss",
    },
    {
        "name": "UN OCHA ReliefWeb",
        "url": "https://reliefweb.int/updates/rss.xml?primary_country=&source=&format=&theme=&disaster=&disaster_type=&vulnerable_groups=&date.from=&date.to=",
        "cred": 9.0,
        "type": "rss",
    },
    # US Government
    {
        "name": "State Dept Press",
        "url": "https://www.state.gov/rss-feed/press-releases/feed/",
        "cred": 9.0,
        "type": "rss",
    },
    {
        "name": "Pentagon / DoD",
        "url": "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945",
        "cred": 9.0,
        "type": "rss",
    },
    # European Union
    {
        "name": "EU External Action",
        "url": "https://www.eeas.europa.eu/eeas/rss_en",
        "cred": 8.5,
        "type": "rss",
    },
    # NATO
    {
        "name": "NATO News",
        "url": "https://www.nato.int/cps/en/natolive/news.htm?type=rss",
        "cred": 9.0,
        "type": "rss",
    },
    # IAEA Nuclear
    {
        "name": "IAEA News",
        "url": "https://www.iaea.org/feeds/press-centre-news",
        "cred": 9.5,
        "type": "rss",
    },
    # CTBTO (Nuclear Test Ban)
    {
        "name": "CTBTO",
        "url": "https://www.ctbto.org/rss",
        "cred": 9.5,
        "type": "rss",
    },
    # SIPRI (Arms)
    {
        "name": "SIPRI",
        "url": "https://feeds.sipri.org/feeds/news",
        "cred": 9.0,
        "type": "rss",
    },
    # ICJ (International Court)
    {
        "name": "ICJ Press",
        "url": "https://www.icj-cij.org/index.php/en/press-releases/rss.xml",
        "cred": 9.5,
        "type": "rss",
    },
    # US CISA Cybersecurity
    {
        "name": "CISA Alerts",
        "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml",
        "cred": 9.0,
        "type": "rss",
    },
    # UNSC Resolutions (via UN)
    {
        "name": "UN Security Council",
        "url": "https://press.un.org/en/un-press-releases/rss.xml",
        "cred": 9.5,
        "type": "rss",
    },
]

# Simple Atom/RSS entry parser regex patterns
_ENTRY_RSS = re.compile(r"<item>(.*?)</item>", re.DOTALL)
_ENTRY_ATOM = re.compile(r"<entry>(.*?)</entry>", re.DOTALL)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL)
_LINK = re.compile(r"<link[^>]*(?:href=[\"']([^\"']+)[\"']|>(.*?)</link>)", re.DOTALL)
_PUBDATE = re.compile(r"<pubDate>(.*?)</pubDate>", re.DOTALL)
_UPDATED = re.compile(r"<updated>(.*?)</updated>", re.DOTALL)
_DESC = re.compile(r"<description>(.*?)</description>", re.DOTALL)


class GovernmentFeedSource(BaseSource):
    """
    Monitors official government, military, and international organization feeds.
    Highest credibility sources — authoritative geopolitical data.
    """

    name = "government"
    interval = 600  # 10 minutes
    credibility = 9.0

    def __init__(self):
        super().__init__()
        self._seen_urls: set[str] = set()
        self._client = httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "SONAR/1.0 (geopolitical intelligence platform)"},
        )

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []

        # Rotate through 4 feeds per cycle
        batch_size = 4
        offset = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(GOV_FEEDS) // batch_size)
        batch = GOV_FEEDS[offset * batch_size: (offset + 1) * batch_size]

        tasks = [self._fetch_feed(feed) for feed in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                events.extend(result)

        # Bound memory
        if len(self._seen_urls) > 3000:
            self._seen_urls = set(list(self._seen_urls)[-1000:])

        return events

    async def _fetch_feed(self, feed: dict) -> list[RawEvent]:
        events = []
        name = feed["name"]
        url = feed["url"]
        cred = feed["cred"]

        try:
            resp = await self._client.get(url)
            resp.raise_for_status()
            content = resp.text

            # Parse entries (try RSS <item> first, then Atom <entry>)
            entries = _ENTRY_RSS.findall(content)
            is_atom = False
            if not entries:
                entries = _ENTRY_ATOM.findall(content)
                is_atom = True

            for entry_xml in entries[:10]:
                # Title
                title_m = _TITLE.search(entry_xml)
                title = _clean_html(title_m.group(1)) if title_m else ""
                if not title:
                    continue

                # Link
                link = ""
                link_m = _LINK.search(entry_xml)
                if link_m:
                    link = link_m.group(1) or link_m.group(2) or ""
                    link = link.strip()

                # Skip seen
                cache_key = link or title
                if cache_key in self._seen_urls:
                    continue
                self._seen_urls.add(cache_key)

                # Description
                desc = ""
                desc_m = _DESC.search(entry_xml)
                if desc_m:
                    desc = _clean_html(desc_m.group(1))[:400]

                # Build text
                text = f"[{name}] {title}"
                if desc:
                    text += f"\n{desc}"

                events.append(RawEvent(
                    source="government",
                    text=text,
                    url=link,
                    timestamp=datetime.now(timezone.utc),
                    credibility=cred,
                    metadata={"feed_name": name},
                ))

        except Exception as e:
            logger.debug(f"Gov feed {name}: {e}")

        return events


def _clean_html(text: str) -> str:
    """Strip HTML tags and CDATA markers."""
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#39;", "'", text)
    return text.strip()
