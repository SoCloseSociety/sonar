import logging
from datetime import datetime, timezone
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.order import Order, Position
from app.models.market import Market, MarketSnapshot
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CLOB_API = "https://clob.polymarket.com"


class TradingService:
    """Handles order placement and position management for Polymarket."""

    async def place_order(
        self,
        db: AsyncSession,
        condition_id: str,
        side: str,
        outcome: str,
        price: float,
        size: float,
        wallet_address: str,
    ) -> Order:
        """Place an order on Polymarket CLOB."""
        # Validate inputs
        if side not in ("BUY", "SELL"):
            raise ValueError("side must be BUY or SELL")
        if outcome not in ("YES", "NO"):
            raise ValueError("outcome must be YES or NO")
        if not (0.01 <= price <= 0.99):
            raise ValueError("price must be between 0.01 and 0.99")
        if size <= 0:
            raise ValueError("size must be positive")

        # Find market
        result = await db.execute(
            select(Market).where(Market.condition_id == condition_id)
        )
        market = result.scalar_one_or_none()
        if not market:
            raise ValueError(f"Market not found: {condition_id}")
        if not market.active:
            raise ValueError("Market is no longer active")

        # Create order record
        order = Order(
            market_id=market.id,
            condition_id=condition_id,
            wallet_address=wallet_address.lower(),
            side=side,
            outcome=outcome,
            price=price,
            size=size,
            status="pending",
        )
        db.add(order)
        await db.flush()

        # Attempt CLOB API submission
        try:
            import httpx
            api_key = settings.polymarket_api_key
            api_secret = settings.polymarket_secret
            passphrase = settings.polymarket_passphrase

            if not all([api_key, api_secret, passphrase]):
                # No CLOB credentials — simulate order fill for demo
                order.status = "filled"
                order.filled_at = datetime.now(timezone.utc)
                order.tx_hash = f"0x{'0' * 64}"  # placeholder
                logger.info(f"[TRADING] Demo fill: {side} {outcome} @ {price} x{size} on {condition_id}")
            else:
                # Real CLOB submission
                async with httpx.AsyncClient(timeout=30) as client:
                    payload = {
                        "tokenID": condition_id,
                        "side": side,
                        "price": str(price),
                        "size": str(size),
                        "type": "GTC",
                    }
                    headers = {
                        "POLY-ADDRESS": wallet_address,
                        "POLY-API-KEY": api_key,
                        "POLY-PASSPHRASE": passphrase,
                    }
                    resp = await client.post(
                        f"{CLOB_API}/order",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        data = resp.json()
                        order.status = "filled"
                        order.filled_at = datetime.now(timezone.utc)
                        order.tx_hash = data.get("transactionHash", data.get("orderID", ""))
                    else:
                        order.status = "failed"
                        order.error_message = resp.text[:500]
                        logger.error(f"[TRADING] CLOB error {resp.status_code}: {resp.text[:200]}")

        except Exception as e:
            order.status = "failed"
            order.error_message = str(e)[:500]
            logger.error(f"[TRADING] Order failed: {e}")

        # Update position if order was filled
        if order.status == "filled":
            await self._update_position(db, order)

        await db.commit()
        await db.refresh(order)
        return order

    async def cancel_order(self, db: AsyncSession, order_id: int, wallet_address: str) -> bool:
        """Cancel a pending order."""
        result = await db.execute(
            select(Order).where(Order.id == order_id, Order.wallet_address == wallet_address.lower())
        )
        order = result.scalar_one_or_none()
        if not order:
            return False
        if order.status != "pending":
            return False

        order.status = "cancelled"
        await db.commit()
        return True

    async def get_orders(
        self, db: AsyncSession, wallet_address: str, status: str | None = None, limit: int = 50
    ) -> list[Order]:
        """Get orders for a wallet."""
        query = select(Order).where(Order.wallet_address == wallet_address.lower())
        if status:
            query = query.where(Order.status == status)
        query = query.order_by(desc(Order.created_at)).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_positions(self, db: AsyncSession, wallet_address: str) -> list[Position]:
        """Get open positions for a wallet, with updated PnL."""
        result = await db.execute(
            select(Position).where(
                Position.wallet_address == wallet_address.lower(),
                Position.size > 0,
            )
        )
        positions = list(result.scalars().all())

        # Update current prices from latest snapshots
        for pos in positions:
            snap_result = await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.market_id == pos.market_id)
                .order_by(desc(MarketSnapshot.captured_at))
                .limit(1)
            )
            snap = snap_result.scalar_one_or_none()
            if snap:
                pos.current_price = snap.price_yes if pos.outcome == "YES" else snap.price_no
                if pos.current_price and pos.avg_price:
                    pos.unrealized_pnl = (pos.current_price - pos.avg_price) * pos.size

        await db.commit()
        return positions

    async def _update_position(self, db: AsyncSession, order: Order):
        """Update or create position after an order fill."""
        result = await db.execute(
            select(Position).where(
                Position.market_id == order.market_id,
                Position.wallet_address == order.wallet_address,
                Position.outcome == order.outcome,
            )
        )
        pos = result.scalar_one_or_none()

        if order.side == "BUY":
            if pos:
                # Update weighted average price
                total_cost = pos.avg_price * pos.size + order.price * order.size
                pos.size += order.size
                pos.avg_price = total_cost / pos.size if pos.size > 0 else 0
            else:
                pos = Position(
                    market_id=order.market_id,
                    condition_id=order.condition_id,
                    wallet_address=order.wallet_address,
                    outcome=order.outcome,
                    size=order.size,
                    avg_price=order.price,
                )
                db.add(pos)
        elif order.side == "SELL" and pos:
            pos.size = max(0, pos.size - order.size)
