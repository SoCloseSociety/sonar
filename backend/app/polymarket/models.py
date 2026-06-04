from pydantic import BaseModel
from datetime import datetime


class MarketData(BaseModel):
    condition_id: str
    question: str
    description: str = ""
    category: str = ""
    outcomes: list[str] = []
    outcome_prices: list[float] = []
    volume_24h: float = 0
    total_volume: float = 0
    liquidity: float = 0
    end_date: datetime | None = None
    active: bool = True
    tags: list[str] = []
    spread: float = 0
    best_bid: float = 0
    best_ask: float = 0


class MarketDelta(BaseModel):
    condition_id: str
    question: str
    price_change: float
    volume_change: float
    old_price: float
    new_price: float
    direction: str  # up | down | stable


class OpportunitySignal(BaseModel):
    market_id: int
    condition_id: str
    question: str
    signal_type: str
    current_price: float
    estimated_fair_value: float
    edge_pct: float
    confidence: float
    direction: str  # BUY_YES | BUY_NO
    reasoning: str
    time_sensitivity: str = "normal"
