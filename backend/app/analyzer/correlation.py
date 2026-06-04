import hashlib
import json
import logging
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import Market, MarketSnapshot
from app.analyzer.classifier import OllamaClassifier
from app.analyzer.rule_based_signals import SPORT_TERMS, GEOPOLITICAL_CATEGORIES
from app.redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)


class MarketCorrelator:
    """Correlates events with Polymarket prediction markets."""

    def __init__(self):
        self.classifier = OllamaClassifier()

    async def correlate(
        self, db: AsyncSession, text: str, category: str, severity: int, keywords: list[str]
    ) -> list[dict]:
        """Two-pass correlation: keyword then semantic. Results cached 20min."""
        # Check cache first
        kw_key = ",".join(sorted(k.lower() for k in keywords)) if keywords else ""
        cache_hash = hashlib.sha256(f"{category}:{severity}:{kw_key}".encode()).hexdigest()[:16]
        cache_key = f"correlation:{cache_hash}"
        cached = await cache_get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                pass

        # Get active markets
        result = await db.execute(
            select(Market).where(Market.active == True).limit(200)
        )
        markets = result.scalars().all()

        if not markets:
            return []

        # Pass 1: Keyword matching
        candidates = []
        text_lower = text.lower()
        category_lower = category.lower() if category else ""
        keywords_lower = [k.lower() for k in keywords] if keywords else []

        is_geopolitical = (category or "").upper() in GEOPOLITICAL_CATEGORIES

        for market in markets:
            question_lower = market.question.lower()
            search_text = f"{question_lower} {(market.description or '').lower()}"

            # Skip sports/entertainment markets for geopolitical events
            if is_geopolitical and any(term in search_text for term in SPORT_TERMS):
                continue

            score = 0

            # Check keyword overlap
            for kw in keywords_lower:
                if kw in question_lower:
                    score += 2

            # Check text overlap
            words = text_lower.split()
            for word in words:
                if len(word) > 4 and word in question_lower:
                    score += 1

            # Check category tags
            if market.tags:
                for tag in market.tags:
                    if tag.lower() in text_lower or tag.lower() in category_lower:
                        score += 1

            if score > 0:
                candidates.append({"market": market, "keyword_score": score})

        # Sort by keyword score
        candidates.sort(key=lambda x: x["keyword_score"], reverse=True)
        top_candidates = candidates[:20]

        if not top_candidates:
            return []

        # Pass 2: Semantic matching via Ollama (if score > threshold)
        high_score_candidates = [c for c in top_candidates if c["keyword_score"] >= 3]

        if high_score_candidates:
            markets_text = "\n".join([
                f"- [{c['market'].condition_id}] {c['market'].question}"
                for c in high_score_candidates
            ])

            try:
                correlations = await self.classifier.correlate_markets(
                    text, category, severity, markets_text
                )
                if correlations:
                    return correlations
            except Exception as e:
                logger.warning(f"Ollama correlation failed: {e}")

        # Fallback: return keyword matches with estimated fair value from price + sentiment
        # Batch fetch snapshots for all fallback candidates in one query
        fallback_candidates = top_candidates[:5]
        fallback_market_ids = [c["market"].id for c in fallback_candidates]
        snap_result = await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id.in_(fallback_market_ids))
            .order_by(desc(MarketSnapshot.captured_at))
        )
        all_snaps = snap_result.scalars().all()
        snapshots_by_market: dict[int, MarketSnapshot] = {}
        for snap in all_snaps:
            if snap.market_id not in snapshots_by_market:
                snapshots_by_market[snap.market_id] = snap

        fallback_results = []
        for c in fallback_candidates:
            market = c["market"]
            kw_score = c["keyword_score"]
            snap = snapshots_by_market.get(market.id)
            current_price = snap.price_yes if snap and snap.price_yes else 0.5
            # Skip illiquid markets with near-zero prices
            if current_price < 0.03:
                continue

            # Estimate fair value: shift from current price based on severity + keyword match
            # Higher keyword score + higher severity = bigger shift
            shift = min(0.25, kw_score * 0.03 + severity * 0.01)
            # Direction: high-severity negative events push price down for positive markets
            if severity >= 7:
                estimated_fv = max(0.05, min(0.95, current_price - shift))
            else:
                estimated_fv = max(0.05, min(0.95, current_price + shift))

            confidence = min(0.65, kw_score * 0.12 + 0.1)

            fallback_results.append({
                "condition_id": market.condition_id,
                "market_id": market.id,
                "question": market.question,
                "estimated_fair_value": estimated_fv,
                "confidence": confidence,
                "reasoning": f"Keyword correlation (score={kw_score}, severity={severity})",
            })

        # Cache results for 20 minutes
        if fallback_results:
            await cache_set(cache_key, json.dumps(fallback_results, default=str), ttl=1200)
        return fallback_results
