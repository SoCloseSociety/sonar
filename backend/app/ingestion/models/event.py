from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class RawEvent:
    """Pre-classification event from any data source."""
    source: str
    text: str
    url: str = ""
    latitude: float | None = None
    longitude: float | None = None
    country: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict = field(default_factory=dict)
    credibility: float = 5.0
    image_url: str = ""
    video_url: str = ""
