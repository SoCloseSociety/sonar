"""YouTube Live Stream Monitor — tracks live news broadcasts for breaking events."""
import asyncio
import logging
import re
from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)
settings = get_settings()

# Major 24/7 news live streams — channel IDs
MONITORED_CHANNELS = {
    # English
    "UCupvZG-5ko_eiXAupbDfxWw": {"name": "CNN", "lang": "en", "cred": 8.0},
    "UC16niRr50-MSBwiO3YDb3RA": {"name": "BBC News", "lang": "en", "cred": 8.5},
    "UCNye-wNBqNL5ZzHSJj3l8Bg": {"name": "Al Jazeera English", "lang": "en", "cred": 7.5},
    "UCoMdktPbSTixAyNGwb-UYkQ": {"name": "Sky News", "lang": "en", "cred": 8.0},
    "UCQfwfsi5VrQ8yKZ-UWmAEFg": {"name": "France 24 English", "lang": "en", "cred": 8.0},
    "UCknLrEdhRCp1aegoMqRaCZg": {"name": "DW News", "lang": "en", "cred": 8.0},
    "UCef1-8eOpJgud7szVPlZQAQ": {"name": "WION", "lang": "en", "cred": 6.5},
    "UCvbRnCOEMfWfzcjhjLoOCxg": {"name": "NDTV", "lang": "en", "cred": 7.0},
    "UCGGhM6XCSJFQ6DTRffnKRIw": {"name": "ABC News", "lang": "en", "cred": 8.0},
    "UCeY0bbntWzzVIaj2z3QigXg": {"name": "NBC News", "lang": "en", "cred": 8.0},
    "UCBi2mrWuNuyYy4gbM6fU18Q": {"name": "ABC News AU", "lang": "en", "cred": 7.5},
    "UCXIJgqnII2ZOINSWNOGFThA": {"name": "FOX News", "lang": "en", "cred": 6.5},
    # Middle East/Arabic
    "UCsRnhjcUCR_Fxo3TobEJgBQ": {"name": "Al Arabiya", "lang": "ar", "cred": 7.0},
    # Asia
    "UChqUTb7kYRX8-EiaN3XFrSQ": {"name": "NHK World Japan", "lang": "en", "cred": 8.5},
    "UC4SUWizzKc1tptprBkWjX2Q": {"name": "CNA (Singapore)", "lang": "en", "cred": 7.5},
    "UC2D2CMWXMOVWx7giW1n3LIg": {"name": "ARIRANG (Korea)", "lang": "en", "cred": 7.0},
    # OSINT / Geo-focused / Conflict Coverage
    "UCBOqkAGTtzAVmKH1dEBSfMA": {"name": "Task & Purpose", "lang": "en", "cred": 7.0},
    "UCwnKziETDbHJtx78nIkfYug": {"name": "LiveMap / War Coverage", "lang": "en", "cred": 6.0},
    "UC4QZ_LsYcvcq7qOsOhpAI4A": {"name": "Reuters", "lang": "en", "cred": 9.0},
    "UCIRYBXDze5krPDzAEOxFGVA": {"name": "TRT World", "lang": "en", "cred": 7.0},
    "UCHd62-u_v4DvJ8TCFtpi4GA": {"name": "Hindustan Times", "lang": "en", "cred": 6.5},
    "UC_gUM8rL-Lrg6O3adPW9K1g": {"name": "Times of India", "lang": "en", "cred": 6.5},
    "UCL_qhgtOy0dy1Agp8vkySQg": {"name": "MSNBC", "lang": "en", "cred": 7.5},
    "UC8p1vwvWtl6T73JiExfWs1g": {"name": "CBS News", "lang": "en", "cred": 8.0},
    "UCDGiCfCZIV5phsoGiPwIcyQ": {"name": "i24 News", "lang": "en", "cred": 7.0},
    "UC-SJ6nODDmufqBzPBwCnYvQ": {"name": "The Sun", "lang": "en", "cred": 6.0},
    "UCddiUEpeqJcYeBxX1IVBKvQ": {"name": "The Guardian", "lang": "en", "cred": 8.0},
    "UC52X_3HScbdJC2pl3ogFn3A": {"name": "Global News (Canada)", "lang": "en", "cred": 7.5},
}

# Keywords to flag as high priority
BREAKING_KEYWORDS = [
    r"\bBREAKING\b", r"\bURGENT\b", r"\bFLASH\b", r"\bALERT\b",
    r"\bmissile\b", r"\bexplosion\b", r"\battack\b", r"\bstrike\b",
    r"\bwar\b", r"\binvasion\b", r"\bcoup\b", r"\bnuclear\b",
    r"\bearthquake\b", r"\btsunami\b", r"\bevacuat\b", r"\bcrash\b",
    r"\bshoot\b", r"\bhostage\b", r"\bterror\b", r"\bbomb\b",
]
_breaking_re = re.compile("|".join(BREAKING_KEYWORDS), re.IGNORECASE)


class YouTubeLiveSource(BaseSource):
    """
    Monitors YouTube live stream metadata and community posts from major news channels.
    Uses the free YouTube RSS feeds (no API key needed) + optional Data API v3.
    """

    name = "youtube_live"
    interval = 180  # 3 minutes
    credibility = 7.0

    def __init__(self):
        super().__init__()
        self._seen_ids: set[str] = set()
        self._client = httpx.AsyncClient(timeout=20, follow_redirects=True)

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []

        # Strategy 1: YouTube RSS feeds (free, no API key)
        rss_events = await self._fetch_rss_feeds()
        events.extend(rss_events)

        # Strategy 2: YouTube Data API v3 (if key available)
        if settings.youtube_api_key:
            api_events = await self._fetch_live_api()
            events.extend(api_events)

        return events

    async def _fetch_rss_feeds(self) -> list[RawEvent]:
        """Fetch latest videos from YouTube channel RSS feeds (completely free)."""
        events: list[RawEvent] = []
        rss_url = "https://www.youtube.com/feeds/videos.xml?channel_id={}"

        # Rotate through 6 channels per cycle to avoid rate limits
        channel_ids = list(MONITORED_CHANNELS.keys())
        batch_size = 6
        offset = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(channel_ids) // batch_size)
        batch = channel_ids[offset * batch_size: (offset + 1) * batch_size]

        tasks = [self._fetch_channel_rss(rss_url.format(cid), cid) for cid in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                events.extend(result)

        return events

    async def _fetch_channel_rss(self, url: str, channel_id: str) -> list[RawEvent]:
        """Parse a single channel's RSS feed."""
        events = []
        info = MONITORED_CHANNELS.get(channel_id, {})
        channel_name = info.get("name", "Unknown")
        cred = info.get("cred", 7.0)

        try:
            resp = await self._client.get(url, headers={"User-Agent": "SONAR/1.0"})
            resp.raise_for_status()
            xml = resp.text

            # Simple XML parsing for Atom feed entries
            entries = re.findall(r"<entry>(.*?)</entry>", xml, re.DOTALL)
            for entry in entries[:5]:  # Last 5 videos
                video_id_m = re.search(r"<yt:videoId>(.*?)</yt:videoId>", entry)
                title_m = re.search(r"<title>(.*?)</title>", entry)
                pub_m = re.search(r"<published>(.*?)</published>", entry)

                if not video_id_m or not title_m:
                    continue

                video_id = video_id_m.group(1)
                title = title_m.group(1)

                # Skip already seen
                if video_id in self._seen_ids:
                    continue
                self._seen_ids.add(video_id)

                # Check for breaking news keywords (higher priority)
                is_breaking = bool(_breaking_re.search(title))

                # Parse publish time
                timestamp = datetime.now(timezone.utc)
                if pub_m:
                    try:
                        timestamp = datetime.fromisoformat(pub_m.group(1).replace("Z", "+00:00"))
                    except ValueError:
                        pass

                    # Skip videos older than 2 hours
                    age = (datetime.now(timezone.utc) - timestamp).total_seconds()
                    if age > 7200:
                        continue

                text = f"[YouTube/{channel_name}] {title}"
                if is_breaking:
                    text = f"[BREAKING] {text}"

                events.append(RawEvent(
                    source="youtube_live",
                    text=text,
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    timestamp=timestamp,
                    credibility=cred + (1.0 if is_breaking else 0.0),
                    metadata={
                        "channel": channel_name,
                        "channel_id": channel_id,
                        "video_id": video_id,
                        "is_live": False,
                        "is_breaking": is_breaking,
                    },
                ))
        except Exception as e:
            logger.debug(f"YouTube RSS for {channel_name}: {e}")

        return events

    async def _fetch_live_api(self) -> list[RawEvent]:
        """Use YouTube Data API v3 to find currently live streams (requires API key)."""
        events = []
        api_url = "https://www.googleapis.com/youtube/v3/search"

        # Search for live broadcasts from news channels
        queries = [
            "live news breaking",
            "live war coverage",
            "live geopolitical",
            "live world news stream",
        ]
        query = queries[int(datetime.now(timezone.utc).timestamp() / self.interval) % len(queries)]

        try:
            resp = await self._client.get(api_url, params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "eventType": "live",
                "relevanceLanguage": "en",
                "maxResults": 10,
                "key": settings.youtube_api_key,
            })
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("items", []):
                video_id = item.get("id", {}).get("videoId", "")
                snippet = item.get("snippet", {})
                title = snippet.get("title", "")
                channel = snippet.get("channelTitle", "")
                desc = snippet.get("description", "")[:300]

                if video_id in self._seen_ids:
                    continue
                self._seen_ids.add(video_id)

                is_breaking = bool(_breaking_re.search(title) or _breaking_re.search(desc))
                text = f"[LIVE YouTube/{channel}] {title}"
                if desc:
                    text += f" — {desc[:200]}"

                events.append(RawEvent(
                    source="youtube_live",
                    text=text,
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    timestamp=datetime.now(timezone.utc),
                    credibility=7.0 + (1.0 if is_breaking else 0.0),
                    metadata={
                        "channel": channel,
                        "video_id": video_id,
                        "is_live": True,
                        "is_breaking": is_breaking,
                    },
                ))
        except Exception as e:
            logger.debug(f"YouTube API search: {e}")

        return events

    async def close(self):
        await self._client.aclose()
