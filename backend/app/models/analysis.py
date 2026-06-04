"""
Analysis model -- stores multi-agent consensus predictions and tracks accuracy.
"""
from datetime import datetime
from sqlalchemy import String, Float, Integer, Text, Index, ForeignKey, func
from sqlalchemy.dialects.postgresql import TIMESTAMP, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("events.id"), nullable=True)
    market_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("markets.id"), nullable=True)

    # Analysis type: "event_analysis", "market_prediction", "threat_assessment", "scenario_forecast"
    analysis_type: Mapped[str] = mapped_column(String(50), default="event_analysis")

    # Multi-agent consensus results
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Agent perspectives (JSONB array of agent assessments)
    # Each: { "agent": "Military Analyst", "assessment": "...", "confidence": 0.8, "severity": 8, "direction": "escalation" }
    agent_assessments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Consensus scores
    consensus_severity: Mapped[float | None] = mapped_column(Float, nullable=True)  # 1-10
    consensus_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-1
    consensus_direction: Mapped[str | None] = mapped_column(String(50), nullable=True)  # escalation, de-escalation, stable, volatile

    # Prediction
    prediction: Mapped[str | None] = mapped_column(Text, nullable=True)
    prediction_probability: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-1
    prediction_timeframe: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "24h", "7d", "30d"

    # Market calibration
    market_price_at_analysis: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_fair_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Accuracy tracking (filled after timeframe expires)
    actual_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    accuracy_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-1
    market_price_at_resolution: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Metadata
    agent_count: Mapped[int] = mapped_column(Integer, default=10)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    categories: Mapped[list | None] = mapped_column(ARRAY(Text), nullable=True)
    entities_mentioned: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_analyses_type", "analysis_type", created_at.desc()),
        Index("idx_analyses_event", "event_id"),
        Index("idx_analyses_market", "market_id"),
        Index("idx_analyses_created", created_at.desc()),
    )
