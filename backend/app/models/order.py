from datetime import datetime
from sqlalchemy import String, Float, Integer, Text, Index, ForeignKey, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(Integer, ForeignKey("markets.id"), nullable=False)
    condition_id: Mapped[str] = mapped_column(String(100), nullable=False)
    wallet_address: Mapped[str] = mapped_column(String(42), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)       # BUY or SELL
    outcome: Mapped[str] = mapped_column(String(10), nullable=False)    # YES or NO
    price: Mapped[float] = mapped_column(Float, nullable=False)
    size: Mapped[float] = mapped_column(Float, nullable=False)          # amount in USDC
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/filled/cancelled/failed
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    filled_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_orders_wallet", "wallet_address", "status"),
        Index("idx_orders_market", "market_id"),
    )


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(Integer, ForeignKey("markets.id"), nullable=False)
    condition_id: Mapped[str] = mapped_column(String(100), nullable=False)
    wallet_address: Mapped[str] = mapped_column(String(42), nullable=False)
    outcome: Mapped[str] = mapped_column(String(10), nullable=False)    # YES or NO
    size: Mapped[float] = mapped_column(Float, default=0)               # total shares
    avg_price: Mapped[float] = mapped_column(Float, default=0)          # weighted average entry
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    unrealized_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_positions_wallet", "wallet_address"),
        Index("idx_positions_market", "market_id", "wallet_address", unique=True),
    )
