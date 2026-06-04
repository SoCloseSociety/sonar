import asyncio
import logging
import httpx
import feedparser
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent

logger = logging.getLogger(__name__)

RSS_FEEDS = [
    # === Tier 1: Major Wire Services ===
    {"url": "https://feeds.reuters.com/reuters/worldNews", "credibility": 9, "name": "Reuters"},
    {"url": "https://feeds.reuters.com/reuters/topNews", "credibility": 9, "name": "Reuters-Top"},
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml", "credibility": 9, "name": "BBC"},
    {"url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", "credibility": 9, "name": "BBC-MiddleEast"},
    {"url": "https://feeds.bbci.co.uk/news/world/europe/rss.xml", "credibility": 9, "name": "BBC-Europe"},
    {"url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "credibility": 9, "name": "NYTimes"},
    {"url": "https://feeds.washingtonpost.com/rss/world", "credibility": 9, "name": "WashPost"},
    {"url": "https://www.theguardian.com/world/rss", "credibility": 9, "name": "Guardian"},
    {"url": "https://www.independent.co.uk/news/world/rss", "credibility": 8, "name": "Independent"},
    {"url": "https://apnews.com/apf-topnews", "credibility": 9, "name": "AP"},

    # === Tier 2: Defense & Military ===
    {"url": "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=10&ContentType=1&Site=945", "credibility": 8, "name": "DoD"},
    {"url": "https://www.janes.com/feeds/news", "credibility": 9, "name": "Janes"},
    {"url": "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml", "credibility": 8, "name": "DefenseNews"},
    {"url": "https://breakingdefense.com/feed/", "credibility": 8, "name": "BreakingDefense"},
    {"url": "https://www.militarytimes.com/arc/outboundfeeds/rss/", "credibility": 8, "name": "MilitaryTimes"},
    {"url": "https://www.airforcetimes.com/arc/outboundfeeds/rss/", "credibility": 8, "name": "AirForceTimes"},
    {"url": "https://www.navytimes.com/arc/outboundfeeds/rss/", "credibility": 8, "name": "NavyTimes"},
    {"url": "https://www.c4isrnet.com/arc/outboundfeeds/rss/?outputType=xml", "credibility": 8, "name": "C4ISRNET"},
    {"url": "https://understandingwar.org/rss.xml", "credibility": 8, "name": "ISW"},
    {"url": "https://www.nato.int/cps/en/natohq/news.xml", "credibility": 9, "name": "NATO"},
    {"url": "https://www.rand.org/feeds/news.xml", "credibility": 8, "name": "RAND"},

    # === Tier 3: Geopolitical / Regional ===
    {"url": "https://www.aljazeera.com/xml/rss/all.xml", "credibility": 7, "name": "AlJazeera"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml", "credibility": 7, "name": "AlJazeera-War"},
    {"url": "https://www.scmp.com/rss/91/feed", "credibility": 7, "name": "SCMP"},
    {"url": "https://tass.com/rss/v2.xml", "credibility": 5, "name": "TASS"},
    {"url": "https://english.alarabiya.net/tools/rss", "credibility": 7, "name": "AlArabiya"},
    {"url": "https://www.france24.com/en/rss", "credibility": 8, "name": "France24"},
    {"url": "https://www.dw.com/en/rss/world/12002560/rss.xml", "credibility": 8, "name": "DW"},
    {"url": "https://rferl.org/api/z-yqpsmtpqosv", "credibility": 7, "name": "RFERL"},
    {"url": "https://www.voanews.com/api/zrqopqmeit", "credibility": 7, "name": "VOA"},
    {"url": "https://www.euronews.com/rss?format=mrss&level=theme&name=news", "credibility": 8, "name": "Euronews"},
    {"url": "https://english.kyodonews.net/rss/news.xml", "credibility": 8, "name": "Kyodo"},
    {"url": "https://www.haaretz.com/cmlink/1.4526494", "credibility": 7, "name": "Haaretz"},
    {"url": "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", "credibility": 7, "name": "TimesOfIndia"},
    {"url": "https://www.dawn.com/feed", "credibility": 7, "name": "Dawn"},
    {"url": "https://www.globaltimes.cn/rss/outbrain.xml", "credibility": 5, "name": "GlobalTimes"},

    # === Tier 4: Financial / Markets ===
    {"url": "https://feeds.bloomberg.com/markets/news.rss", "credibility": 9, "name": "Bloomberg"},
    {"url": "https://www.ft.com/rss/home", "credibility": 9, "name": "FT"},
    {"url": "https://www.wsj.com/xml/rss/3_7085.xml", "credibility": 9, "name": "WSJ"},
    {"url": "https://feeds.marketwatch.com/marketwatch/topstories/", "credibility": 8, "name": "MarketWatch"},
    {"url": "https://finance.yahoo.com/rss/topfinstories", "credibility": 7, "name": "Yahoo-Finance"},
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "credibility": 7, "name": "CoinDesk"},
    {"url": "https://cointelegraph.com/rss", "credibility": 7, "name": "CoinTelegraph"},

    # === Tier 5: Nuclear / Energy ===
    {"url": "https://www.iaea.org/feeds/newscentre/news", "credibility": 9, "name": "IAEA"},
    {"url": "https://www.world-nuclear-news.org/rss", "credibility": 8, "name": "WNN"},
    {"url": "https://www.energymonitor.ai/feed/", "credibility": 7, "name": "EnergyMonitor"},
    {"url": "https://oilprice.com/rss/main", "credibility": 7, "name": "OilPrice"},

    # === Tier 6: Natural Disasters & Humanitarian ===
    {"url": "https://reliefweb.int/updates/rss.xml", "credibility": 8, "name": "ReliefWeb"},
    {"url": "https://www.fema.gov/feeds/disasters/major_disaster_declarations", "credibility": 9, "name": "FEMA"},
    {"url": "https://www.undrr.org/rss.xml", "credibility": 8, "name": "UNDRR"},

    # === Tier 7: Cyber & Technology ===
    {"url": "https://feeds.feedburner.com/TheHackersNews", "credibility": 7, "name": "HackersNews"},
    {"url": "https://www.bleepingcomputer.com/feed/", "credibility": 7, "name": "BleepingComputer"},
    {"url": "https://krebsonsecurity.com/feed/", "credibility": 8, "name": "KrebsSecurity"},
    {"url": "https://www.darkreading.com/rss.xml", "credibility": 7, "name": "DarkReading"},
    {"url": "https://isc.sans.edu/rssfeed.xml", "credibility": 8, "name": "SANS"},

    # === Tier 8: Sanctions / Trade ===
    {"url": "https://home.treasury.gov/system/files/231/ofac-recent-actions.xml", "credibility": 9, "name": "OFAC"},
    {"url": "https://www.state.gov/rss-feed/press-releases/feed/", "credibility": 9, "name": "StateDept"},
    {"url": "https://www.whitehouse.gov/feed/", "credibility": 9, "name": "WhiteHouse"},
    {"url": "https://ec.europa.eu/commission/presscorner/api/rss", "credibility": 9, "name": "EUCommission"},
    {"url": "https://www.un.org/press/en/rss.xml", "credibility": 9, "name": "UN"},

    # === Tier 9: OSINT / Conflict Tracking ===
    {"url": "https://acleddata.com/feed/", "credibility": 8, "name": "ACLED"},
    {"url": "https://theintercept.com/feed/?rss=1", "credibility": 7, "name": "Intercept"},
    {"url": "https://foreignpolicy.com/feed/", "credibility": 8, "name": "ForeignPolicy"},
    {"url": "https://www.crisisgroup.org/api/rss/latest-updates", "credibility": 8, "name": "ICG"},
    {"url": "https://www.cfr.org/rss/publications", "credibility": 8, "name": "CFR"},
    {"url": "https://carnegieendowment.org/rss", "credibility": 8, "name": "Carnegie"},
    {"url": "https://warontherocks.com/feed/", "credibility": 8, "name": "WarOnTheRocks"},
    {"url": "https://taskandpurpose.com/feed/", "credibility": 7, "name": "TaskAndPurpose"},

    # === Tier 10: Regional Conflict ===
    {"url": "https://www.kyivindependent.com/rss/", "credibility": 7, "name": "KyivIndependent"},
    {"url": "https://english.nv.ua/rss/all.rss", "credibility": 7, "name": "NV-Ukraine"},
    {"url": "https://www.middleeasteye.net/rss", "credibility": 7, "name": "MiddleEastEye"},
    {"url": "https://www.mei.edu/rss", "credibility": 8, "name": "MEI"},
    {"url": "https://www.asiatimes.com/feed", "credibility": 7, "name": "AsiaTimes"},
    {"url": "https://thediplomat.com/feed/", "credibility": 8, "name": "TheDiplomat"},
    {"url": "https://www.atlanticcouncil.org/feed/", "credibility": 8, "name": "AtlanticCouncil"},
    {"url": "https://thehill.com/rss/syndicator/19110/feed", "credibility": 7, "name": "TheHill"},

    # === Tier 11: Science & Health ===
    {"url": "https://www.who.int/rss-feeds/news-english.xml", "credibility": 9, "name": "WHO"},
    {"url": "https://www.cdc.gov/rss/hhan/rss.xml", "credibility": 9, "name": "CDC"},

    # === Tier 12: Think Tanks & Strategic Analysis ===
    {"url": "https://www.csis.org/analysis/feed", "credibility": 8, "name": "CSIS"},
    {"url": "https://www.brookings.edu/feed/", "credibility": 8, "name": "Brookings"},
    {"url": "https://www.rand.org/blog.xml", "credibility": 8, "name": "RAND"},
    {"url": "https://www.chathamhouse.org/rss", "credibility": 8, "name": "ChathamHouse"},
    {"url": "https://www.sipri.org/rss.xml", "credibility": 9, "name": "SIPRI"},
    {"url": "https://www.iiss.org/rss/", "credibility": 8, "name": "IISS"},
    {"url": "https://rusi.org/feed", "credibility": 8, "name": "RUSI"},
    {"url": "https://ecfr.eu/feed/", "credibility": 8, "name": "ECFR"},
    {"url": "https://www.stimson.org/feed/", "credibility": 8, "name": "Stimson"},
    {"url": "https://www.armscontrol.org/taxonomy/term/2/feed", "credibility": 8, "name": "ArmsControl"},

    # === Tier 13: OSINT & Investigative ===
    {"url": "https://www.bellingcat.com/feed/", "credibility": 8, "name": "Bellingcat"},
    {"url": "https://www.occrp.org/en/component/allrss/?type=1", "credibility": 8, "name": "OCCRP"},
    {"url": "https://www.accessnow.org/feed/", "credibility": 7, "name": "AccessNow"},
    {"url": "https://citizenlab.ca/feed/", "credibility": 8, "name": "CitizenLab"},
    {"url": "https://www.amnesty.org/en/latest/rss.xml", "credibility": 8, "name": "Amnesty"},
    {"url": "https://www.hrw.org/rss/news_and_features", "credibility": 8, "name": "HRW"},

    # === Tier 14: Energy & Commodities ===
    {"url": "https://oilprice.com/rss/main", "credibility": 7, "name": "OilPrice"},
    {"url": "https://www.spglobal.com/commodityinsights/en/rss-feed/rss-feed", "credibility": 8, "name": "SPGlobal"},
    {"url": "https://www.mining.com/feed/", "credibility": 7, "name": "MiningDotCom"},

    # === Tier 15: Cyber & InfoSec ===
    {"url": "https://krebsonsecurity.com/feed/", "credibility": 8, "name": "KrebsOnSecurity"},
    {"url": "https://www.bleepingcomputer.com/feed/", "credibility": 7, "name": "BleepingComputer"},
    {"url": "https://therecord.media/feed", "credibility": 8, "name": "TheRecord"},
    {"url": "https://www.darkreading.com/rss.xml", "credibility": 7, "name": "DarkReading"},
]


def _extract_image_url(entry) -> str:
    """Extract image/thumbnail URL from a feedparser entry."""
    # 1. Check <enclosure> tag (podcasts / images)
    for enc in entry.get("enclosures", []):
        mime = enc.get("type", "")
        if mime.startswith("image/"):
            url = enc.get("url") or enc.get("href")
            if url:
                return url

    # 2. Check media:content namespace (many news feeds)
    media_content = entry.get("media_content", [])
    if media_content:
        for mc in media_content:
            mime = mc.get("type", "")
            if mime.startswith("image/") or not mime:
                url = mc.get("url")
                if url:
                    return url

    # 3. Check media:thumbnail
    media_thumbnail = entry.get("media_thumbnail", [])
    if media_thumbnail:
        url = media_thumbnail[0].get("url")
        if url:
            return url

    # 4. Check og:image-style via links
    for link in entry.get("links", []):
        rel = link.get("rel", "")
        mime = link.get("type", "")
        if rel in ("enclosure", "related") and mime.startswith("image/"):
            url = link.get("href")
            if url:
                return url

    return ""


class RSSSource(BaseSource):
    name = "rss"
    interval = 300  # 5 minutes
    credibility = 8.0

    async def _fetch_single_feed(
        self,
        client: httpx.AsyncClient,
        feed_config: dict,
    ) -> list[RawEvent]:
        """Fetch and parse a single RSS feed."""
        events: list[RawEvent] = []
        try:
            resp = await client.get(feed_config["url"])
            if resp.status_code != 200:
                logger.debug(f"RSS {feed_config['name']}: HTTP {resp.status_code}")
                return events

            parsed = feedparser.parse(resp.text)

            for entry in parsed.entries[:15]:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                link = entry.get("link", "")

                if not title:
                    continue

                if summary and summary != title:
                    text = f"{title}. {summary[:500]}"
                else:
                    text = title

                image_url = _extract_image_url(entry)

                events.append(RawEvent(
                    source=f"rss:{feed_config['name']}",
                    text=text,
                    url=link,
                    credibility=feed_config["credibility"],
                    image_url=image_url,
                ))
        except Exception as e:
            logger.debug(f"RSS feed {feed_config['name']} failed: {e}")

        return events

    async def fetch(self) -> list[RawEvent]:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "SONAR/1.0 Intelligence Aggregator"},
        ) as client:
            # Fetch all feeds concurrently instead of sequentially
            tasks = [
                self._fetch_single_feed(client, feed_config)
                for feed_config in RSS_FEEDS
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        events: list[RawEvent] = []
        for result in results:
            if isinstance(result, list):
                events.extend(result)
            elif isinstance(result, Exception):
                logger.debug(f"RSS gather exception: {result}")

        logger.info(f"RSS collected {len(events)} articles from {len(RSS_FEEDS)} feeds")
        return events
