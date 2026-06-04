from datetime import datetime
from sqlalchemy import String, Integer, Text, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    signal_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("signals.id"), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_alert_history_user_sent", "user_id", sent_at.desc()),
        Index("idx_alert_history_signal", "signal_id"),
        Index("idx_alert_history_sent", sent_at.desc()),
    )
