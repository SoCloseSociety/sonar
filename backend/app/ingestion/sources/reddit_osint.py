"""Reddit OSINT Monitor — tracks geopolitical subreddits for breaking events."""
import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

# Subreddits ranked by OSINT relevance
MONITORED_SUBS = [
    {"sub": "worldnews", "cred": 6.5, "sort": "new", "limit": 15},
    {"sub": "geopolitics", "cred": 7.0, "sort": "new", "limit": 10},
    {"sub": "UkraineWarVideoReport", "cred": 6.0, "sort": "new", "limit": 10},
    {"sub": "CombatFootage", "cred": 5.5, "sort": "new", "limit": 10},
    {"sub": "CredibleDefense", "cred": 7.5, "sort": "new", "limit": 10},
    {"sub": "osint", "cred": 7.0, "sort": "hot", "limit": 10},
    {"sub": "IntelligenceNews", "cred": 7.0, "sort": "new", "limit": 10},
    {"sub": "NuclearWeapons", "cred": 7.0, "sort": "new", "limit": 5},
    {"sub": "LessCredibleDefence", "cred": 5.0, "sort": "hot", "limit": 5},
    {"sub": "Earthquakes", "cred": 8.0, "sort": "new", "limit": 5},
    {"sub": "TropicalWeather", "cred": 7.5, "sort": "new", "limit": 5},
    {"sub": "FlightTracking", "cred": 6.5, "sort": "new", "limit": 5},
]

# Reddit JSON API headers
HEADERS = {
    "User-Agent": "SONAR-Intel/1.0 (geopolitical monitoring platform)",
    "Accept": "application/json",
}


class RedditOSINTSource(BaseSource):
    """
    Monitors key Reddit subreddits for breaking geopolitical events.
    Uses the public JSON API (no auth needed, rate limited to ~60 req/min).
    """

    name = "reddit"
    interval = 240  # 4 minutes
    credibility = 6.5

    def __init__(self):
        super().__init__()
        self._seen_ids: set[str] = set()
        self._client = httpx.AsyncClient(timeout=15, follow_redirects=True, headers=HEADERS)

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []

        # Rotate through 4 subs per cycle to stay under rate limits
        batch_size = 4
        offset = int(datetime.now(timezone.utc).timestamp() / self.interval) % max(1, len(MONITORED_SUBS) // batch_size)
        batch = MONITORED_SUBS[offset * batch_size: (offset + 1) * batch_size]

        tasks = [self._fetch_subreddit(s) for s in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                events.extend(result)

        # Keep seen_ids bounded
        if len(self._seen_ids) > 5000:
            self._seen_ids = set(list(self._seen_ids)[-2000:])

        return events

    async def _fetch_subreddit(self, sub_cfg: dict) -> list[RawEvent]:
        events = []
        sub = sub_cfg["sub"]
        cred = sub_cfg["cred"]
        sort = sub_cfg["sort"]
        limit = sub_cfg["limit"]

        try:
            url = f"https://www.reddit.com/r/{sub}/{sort}.json"
            resp = await self._client.get(url, params={"limit": limit, "raw_json": 1})
            resp.raise_for_status()
            data = resp.json()

            posts = data.get("data", {}).get("children", [])
            for post_wrap in posts:
                post = post_wrap.get("data", {})
                post_id = post.get("id", "")

                if post_id in self._seen_ids:
                    continue
                self._seen_ids.add(post_id)

                title = post.get("title", "").strip()
                selftext = (post.get("selftext") or "")[:300].strip()
                score = post.get("score", 0)
                created = post.get("created_utc", 0)
                permalink = post.get("permalink", "")
                flair = post.get("link_flair_text", "")
                url_link = post.get("url", "")

                if not title:
                    continue

                # Skip low-engagement posts in hot sort
                if sort == "hot" and score < 50:
                    continue

                # Skip old posts (> 6 hours)
                age = datetime.now(timezone.utc).timestamp() - created
                if age > 21600:
                    continue

                # Build event text
                text = f"[Reddit/r/{sub}] {title}"
                if flair:
                    text = f"[Reddit/r/{sub}][{flair}] {title}"
                if selftext:
                    text += f"\n{selftext}"

                events.append(RawEvent(
                    source="reddit",
                    text=text,
                    url=f"https://reddit.com{permalink}" if permalink else url_link,
                    timestamp=datetime.fromtimestamp(created, tz=timezone.utc) if created else datetime.now(timezone.utc),
                    credibility=cred,
                    metadata={
                        "subreddit": sub,
                        "score": score,
                        "flair": flair,
                        "post_id": post_id,
                    },
                ))

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning(f"Reddit rate limited on r/{sub}")
            else:
                logger.debug(f"Reddit r/{sub}: HTTP {e.response.status_code}")
        except Exception as e:
            logger.debug(f"Reddit r/{sub}: {e}")

        return events
