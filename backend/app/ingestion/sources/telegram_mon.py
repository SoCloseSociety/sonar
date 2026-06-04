import logging
from app.ingestion.base_source import BaseSource
from app.ingestion.models.event import RawEvent
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CHANNELS = [
    # === Ukraine / Russia Conflict ===
    {"name": "intelslava", "credibility": 6.0},
    {"name": "ryaborslash", "credibility": 6.0},
    {"name": "ukraine_now", "credibility": 6.0},
    {"name": "ukraine_world", "credibility": 6.5},
    {"name": "UkraineNow", "credibility": 6.0},
    {"name": "war_monitor", "credibility": 6.5},
    {"name": "militaryosint", "credibility": 7.0},
    {"name": "WarTranslated", "credibility": 7.0},
    {"name": "defenseofua", "credibility": 6.5},
    {"name": "UkraineArmedForces", "credibility": 7.0},

    # === Global News & OSINT ===
    {"name": "SputnikInt", "credibility": 5.0},
    {"name": "CIG_telegram", "credibility": 6.5},
    {"name": "GeneralMCNews", "credibility": 6.0},
    {"name": "osintbear", "credibility": 6.5},
    {"name": "GeoConfirmed", "credibility": 7.0},
    {"name": "IntelSlava_Z", "credibility": 5.5},
    {"name": "wargonzo", "credibility": 5.5},
    {"name": "breakingmiltary", "credibility": 6.0},
    {"name": "worldwarnews", "credibility": 6.0},
    {"name": "newsoftheworld2022", "credibility": 5.5},

    # === Middle East ===
    {"name": "QudsNen", "credibility": 5.5},
    {"name": "almanarnews", "credibility": 5.0},
    {"name": "middleeast_spectrum", "credibility": 6.0},
    {"name": "IsraeliPM", "credibility": 8.0},
    {"name": "idf_english", "credibility": 8.0},

    # === Financial & Crypto ===
    {"name": "whalealert", "credibility": 7.0},
    {"name": "cryptoalert", "credibility": 6.0},
    {"name": "ZeroHedgeNews", "credibility": 5.5},
    {"name": "marketsinsider", "credibility": 7.0},
    {"name": "investingcom", "credibility": 7.0},

    # === Cyber / Tech ===
    {"name": "vxunderground", "credibility": 7.5},
    {"name": "darkwebinformer", "credibility": 6.5},
    {"name": "krebsonsecurity", "credibility": 8.5},
    {"name": "cybersecuritynews", "credibility": 7.0},

    # === Asia / Pacific ===
    {"name": "asia_times_now", "credibility": 6.5},
    {"name": "NKNewsOrg", "credibility": 7.5},
    {"name": "TaiwanInsider", "credibility": 7.0},
    {"name": "ChinaObservers", "credibility": 6.5},
]


class TelegramMonitorSource(BaseSource):
    name = "telegram_monitor"
    interval = 120
    credibility = 5.0

    def __init__(self):
        super().__init__()
        self._client = None
        self._cycle_index = 0

    async def fetch(self) -> list[RawEvent]:
        if not settings.telegram_api_id or not settings.telegram_api_hash:
            return []

        events = []

        try:
            from telethon import TelegramClient
            from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument

            if self._client is None:
                self._client = TelegramClient(
                    "sonar_monitor",
                    int(settings.telegram_api_id),
                    settings.telegram_api_hash,
                )
                await self._client.start()

            # Rotate through 8 channels per cycle
            cycle_size = 8
            start = (self._cycle_index * cycle_size) % len(CHANNELS)
            batch = (CHANNELS * 2)[start:start + cycle_size]
            self._cycle_index += 1

            for ch_cfg in batch:
                channel = ch_cfg["name"]
                cred = ch_cfg["credibility"]
                try:
                    async for message in self._client.iter_messages(channel, limit=5):
                        text = message.text or ""
                        if not text and not message.media:
                            continue

                        # Extract media URL if available
                        image_url = ""
                        video_url = ""
                        if message.media:
                            if isinstance(message.media, MessageMediaPhoto):
                                # Photo - we can get the download URL via Telegram CDN
                                # Store as a marker; actual download would require file transfer
                                image_url = f"telegram://photo/{channel}/{message.id}"
                            elif isinstance(message.media, MessageMediaDocument):
                                doc = message.media.document
                                if doc:
                                    mime = getattr(doc, "mime_type", "") or ""
                                    if mime.startswith("video/"):
                                        video_url = f"telegram://video/{channel}/{message.id}"
                                    elif mime.startswith("image/"):
                                        image_url = f"telegram://image/{channel}/{message.id}"

                        if not text:
                            text = f"[Media from {channel}]"

                        events.append(RawEvent(
                            source=f"telegram:{channel}",
                            text=text,
                            credibility=cred,
                            metadata={"channel": channel, "message_id": message.id},
                            image_url=image_url,
                            video_url=video_url,
                        ))
                except Exception as e:
                    logger.debug(f"Telegram channel {channel} failed: {e}")
                    continue
        except ImportError:
            logger.warning("Telethon not available for Telegram monitoring")
        except Exception as e:
            logger.error(f"Telegram monitor error: {e}")

        return events
