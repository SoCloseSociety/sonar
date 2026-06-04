from datetime import datetime
from sqlalchemy import String, Float, Index, func
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TensionHistory(Base):
    __tablename__ = "tension_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_tension_time", calculated_at.desc()),
    )
