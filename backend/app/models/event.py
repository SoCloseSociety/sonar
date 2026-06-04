from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, Index, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from geoalchemy2 import Geometry
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    severity: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    impact_score: Mapped[int] = mapped_column(Integer, default=0)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    market_direction: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list | None] = mapped_column(ARRAY(Text), nullable=True)
    cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # Note: GeoAlchemy2 auto-creates a GiST index on 'location' column
    __table_args__ = (
        Index("idx_events_category", "category", "severity"),
        Index("idx_events_created", created_at.desc()),
        Index("idx_events_source", "source"),
        Index("idx_events_country", "country"),
        Index("idx_events_severity", "severity"),
        Index("idx_events_feed", created_at.desc(), "category", "severity"),
    )
