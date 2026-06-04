from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.polymarket.trading import TradingService

router = APIRouter()
trading_service = TradingService()


class PlaceOrderRequest(BaseModel):
    condition_id: str
    side: str = Field(pattern=r"^(BUY|SELL)$")
    outcome: str = Field(pattern=r"^(YES|NO)$")
    price: float = Field(ge=0.01, le=0.99)
    size: float = Field(gt=0)


class OrderResponse(BaseModel):
    id: int
    market_id: int
    condition_id: str
    wallet_address: str
    side: str
    outcome: str
    price: float
    size: float
    status: str
    tx_hash: str | None = None
    error_message: str | None = None
    created_at: str
    filled_at: str | None = None

    model_config = {"from_attributes": True}


class PositionResponse(BaseModel):
    id: int
    market_id: int
    condition_id: str
    outcome: str
    size: float
    avg_price: float
    current_price: float | None = None
    unrealized_pnl: float | None = None

    model_config = {"from_attributes": True}


@router.post("/orders", response_model=OrderResponse)
async def place_order(
    req: PlaceOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet not connected")

    try:
        order = await trading_service.place_order(
            db=db,
            condition_id=req.condition_id,
            side=req.side,
            outcome=req.outcome,
            price=req.price,
            size=req.size,
            wallet_address=user.wallet_address,
        )
        return OrderResponse(
            id=order.id,
            market_id=order.market_id,
            condition_id=order.condition_id,
            wallet_address=order.wallet_address,
            side=order.side,
            outcome=order.outcome,
            price=order.price,
            size=order.size,
            status=order.status,
            tx_hash=order.tx_hash,
            error_message=order.error_message,
            created_at=order.created_at.isoformat(),
            filled_at=order.filled_at.isoformat() if order.filled_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet not connected")

    success = await trading_service.cancel_order(db, order_id, user.wallet_address)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found or not cancellable")
    return {"status": "cancelled"}


VALID_ORDER_STATUSES = {"pending", "filled", "cancelled", "failed"}


@router.get("/orders")
async def list_orders(
    status: str | None = None,
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet not connected")

    # Validate status to avoid invalid DB queries
    if status is not None and status not in VALID_ORDER_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {', '.join(VALID_ORDER_STATUSES)}")

    orders = await trading_service.get_orders(db, user.wallet_address, status, limit)
    return [
        OrderResponse(
            id=o.id,
            market_id=o.market_id,
            condition_id=o.condition_id,
            wallet_address=o.wallet_address,
            side=o.side,
            outcome=o.outcome,
            price=o.price,
            size=o.size,
            status=o.status,
            tx_hash=o.tx_hash,
            error_message=o.error_message,
            created_at=o.created_at.isoformat(),
            filled_at=o.filled_at.isoformat() if o.filled_at else None,
        )
        for o in orders
    ]


@router.get("/positions")
async def list_positions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet not connected")

    positions = await trading_service.get_positions(db, user.wallet_address)
    return [
        PositionResponse(
            id=p.id,
            market_id=p.market_id,
            condition_id=p.condition_id,
            outcome=p.outcome,
            size=p.size,
            avg_price=p.avg_price,
            current_price=p.current_price,
            unrealized_pnl=p.unrealized_pnl,
        )
        for p in positions
    ]
