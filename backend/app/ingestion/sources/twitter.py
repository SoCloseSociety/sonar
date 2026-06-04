import logging
import httpx
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Credibility scores per account category
OSINT_ACCOUNTS = [
    # === Military & Conflict OSINT ===
    {"handle": "sentdefender", "credibility": 6.5},
    {"handle": "IntelCrab", "credibility": 6.5},
    {"handle": "Osinttechnical", "credibility": 6.5},
    {"handle": "conflicts", "credibility": 6.5},
    {"handle": "AuroraIntel", "credibility": 6.5},
    {"handle": "GeoConfirmed", "credibility": 7.0},
    {"handle": "UAWeapons", "credibility": 6.5},
    {"handle": "WarMonitor3", "credibility": 6.0},
    {"handle": "OSINTdefender", "credibility": 7.0},
    {"handle": "Militarylandnet", "credibility": 7.0},
    {"handle": "RALee85", "credibility": 7.5},
    {"handle": "IDF", "credibility": 8.0},
    {"handle": "Jerusalem_Post", "credibility": 7.0},
    {"handle": "TimesOfIsrael", "credibility": 7.5},
    {"handle": "AlArabiya_Eng", "credibility": 7.0},
    {"handle": "Syrian_Archive", "credibility": 7.0},

    # === Breaking News & Wire ===
    {"handle": "Reuters", "credibility": 9.0},
    {"handle": "AP", "credibility": 9.0},
    {"handle": "BBCWorld", "credibility": 9.0},
    {"handle": "CNN", "credibility": 8.0},
    {"handle": "France24_en", "credibility": 8.0},
    {"handle": "DW_en", "credibility": 8.0},
    {"handle": "AJEnglish", "credibility": 7.5},

    # === Markets & Finance ===
    {"handle": "zerohedge", "credibility": 5.5},
    {"handle": "WatcherGuru", "credibility": 6.0},
    {"handle": "unusual_whales", "credibility": 7.0},
    {"handle": "DeItaone", "credibility": 7.5},
    {"handle": "FirstSquawk", "credibility": 7.5},
    {"handle": "whale_alert", "credibility": 7.0},
    {"handle": "lookonchain", "credibility": 6.5},
    {"handle": "Schuldensuehner", "credibility": 7.0},

    # === Geopolitics & Think Tanks ===
    {"handle": "ISW_Research", "credibility": 8.5},
    {"handle": "AtlanticCouncil", "credibility": 8.0},
    {"handle": "CFR_org", "credibility": 8.5},
    {"handle": "BellingcatENG", "credibility": 8.0},
    {"handle": "EliotHiggins", "credibility": 7.5},
    {"handle": "ICG_crisisgroup", "credibility": 8.5},

    # === Energy & Commodities ===
    {"handle": "OilPrice_com", "credibility": 7.0},
    {"handle": "iea", "credibility": 9.0},
    {"handle": "OPEC", "credibility": 8.5},
    {"handle": "EIAgov", "credibility": 9.0},

    # === Cyber ===
    {"handle": "vxunderground", "credibility": 7.5},
    {"handle": "GossiTheDog", "credibility": 7.5},
    {"handle": "briankrebs", "credibility": 8.5},
    {"handle": "cyberscoop", "credibility": 7.5},

    # === Government & Official ===
    {"handle": "WhiteHouse", "credibility": 9.0},
    {"handle": "StateDept", "credibility": 9.0},
    {"handle": "DeptofDefense", "credibility": 9.0},
    {"handle": "CENTCOM", "credibility": 9.0},
    {"handle": "NATO", "credibility": 9.0},
    {"handle": "UN", "credibility": 9.0},
    {"handle": "IAEAorg", "credibility": 9.0},
    {"handle": "EU_Commission", "credibility": 9.0},
]


class TwitterSource(BaseSource):
    name = "twitter"
    interval = 300
    credibility = 6.0
    _cycle_index = 0  # rotate through accounts across cycles

    async def fetch(self) -> list[RawEvent]:
        if not settings.twitter_bearer_token:
            return []

        events = []
        headers = {"Authorization": f"Bearer {settings.twitter_bearer_token}"}

        # Rotate 8 accounts per cycle across all accounts
        cycle_size = 8
        start = (TwitterSource._cycle_index * cycle_size) % len(OSINT_ACCOUNTS)
        batch = (OSINT_ACCOUNTS * 2)[start:start + cycle_size]
        TwitterSource._cycle_index += 1

        async with httpx.AsyncClient(timeout=20, headers=headers) as client:
            for account_cfg in batch:
                account = account_cfg["handle"]
                cred = account_cfg["credibility"]
                try:
                    resp = await client.get(
                        "https://api.twitter.com/2/tweets/search/recent",
                        params={
                            "query": f"from:{account} -is:retweet",
                            "max_results": 10,
                            "tweet.fields": "created_at,text,attachments",
                            "expansions": "attachments.media_keys",
                            "media.fields": "url,preview_image_url,type",
                        },
                    )

                    if resp.status_code == 429:
                        logger.warning("Twitter rate limited, backing off")
                        break

                    if resp.status_code != 200:
                        continue

                    data = resp.json()

                    # Build media key -> url map
                    media_map: dict[str, str] = {}
                    for m in data.get("includes", {}).get("media", []):
                        key = m.get("media_key", "")
                        url = m.get("url") or m.get("preview_image_url") or ""
                        if key and url:
                            media_map[key] = url

                    for tweet in data.get("data", []):
                        # Extract first image URL if any
                        image_url = ""
                        attachments = tweet.get("attachments", {})
                        for mk in attachments.get("media_keys", []):
                            if mk in media_map:
                                image_url = media_map[mk]
                                break

                        events.append(RawEvent(
                            source=f"twitter:@{account}",
                            text=tweet.get("text", ""),
                            url=f"https://twitter.com/{account}/status/{tweet['id']}",
                            credibility=cred,
                            metadata={"account": account},
                            image_url=image_url,
                        ))
                except Exception as e:
                    logger.debug(f"Twitter fetch for @{account} failed: {e}")
                    continue

        return events
