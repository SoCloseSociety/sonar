from datetime import datetime
from sqlalchemy import String, Float, Integer, Text, Index, ForeignKey, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("events.id"), nullable=True)
    market_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("markets.id"), nullable=True)
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_fair_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    edge_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    time_sensitivity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    actual_price_at_resolve: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_signals_status", "status", created_at.desc()),
        Index("idx_signals_event", "event_id"),
        Index("idx_signals_market", "market_id"),
        Index("idx_signals_confidence", "confidence"),
        Index("idx_signals_created", created_at.desc()),
    )
