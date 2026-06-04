"""
Rule-based signal generator.

Creates signals when significant events (severity >= 5) match active
Polymarket markets by keyword overlap -- no Ollama dependency.

This acts as a guaranteed fallback so the system always produces signals
for significant events, even when the LLM pipeline is down or returns
poor-quality classifications.
"""

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.market import Market, MarketSnapshot
from app.models.signal import Signal
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Words too common to be useful for matching
STOP_WORDS = frozenset({
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
    "was", "one", "our", "out", "has", "have", "will", "with", "this",
    "that", "from", "they", "been", "said", "each", "which", "their",
    "about", "would", "there", "could", "other", "into", "more", "than",
    "some", "very", "when", "what", "your", "just", "also", "over",
    "such", "after", "before", "between", "these", "those", "does",
    "being", "most", "only", "still", "should", "while", "where",
    "might", "much", "down", "then", "them", "same", "many", "first",
    "market", "markets", "price", "prices", "will", "year", "years",
    "new", "news", "report", "reports", "according", "says", "sources",
    # Noise words that appear in URLs, dates, or generic text
    "http", "https", "www", "html", "source", "title", "data", "public",
    "game", "games", "winner", "winners", "gets", "live", "base",
    "march", "april", "june", "july", "2024", "2025", "2026", "2027",
    "january", "february", "august", "september", "october", "november", "december",
})

# Minimum number of keyword hits to consider a market relevant
# 1 hit is enough when the keyword is a significant proper noun or geopolitical term
MIN_KEYWORD_HITS = 1

# Minimum length for a word to be considered a keyword
# 3 allows acronyms like NATO, CIA, IMF, IDF
MIN_WORD_LENGTH = 3

# High-value geopolitical terms that alone justify a market match
GEO_TERMS = frozenset({
    "iran", "russia", "china", "ukraine", "israel", "taiwan", "north korea",
    "nato", "trump", "putin", "biden", "khamenei", "netanyahu", "zelensky",
    "nuclear", "bitcoin", "crypto", "election", "ceasefire", "invasion",
})

# Sports/entertainment terms — markets with these should NOT be linked to geopolitical events
SPORT_TERMS = frozenset({
    "nba", "nfl", "nhl", "mlb", "fifa", "premier league", "champions league",
    "world cup", "formula 1", "f1 ", "nascar", "olympics", "wimbledon",
    "super bowl", "playoffs", "stanley cup", "world series", "grand prix",
    "ufc", "mma", "boxing", "tennis", "cricket", "rugby", "la liga",
    "bundesliga", "serie a", "ligue 1", "mavericks", "lakers", "celtics",
    "warriors", "yankees", "dodgers", "patriots", "chiefs", "eagles",
    "oscars", "grammy", "emmy", "golden globe", "bachelor", "survivor",
    "american idol", "big brother",
})

# Event categories that are strictly geopolitical — should never match sports markets
GEOPOLITICAL_CATEGORIES = frozenset({
    "MILITARY_CONFLICT", "NUCLEAR", "MARITIME_SECURITY", "CYBER_ATTACK",
    "TERRORISM", "SANCTIONS", "AVIATION_INCIDENT",
})


def extract_keywords(text: str) -> list[str]:
    """Extract meaningful keywords from raw text."""
    if not text:
        return []
    # Lowercase + keep only alphanumeric and spaces
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    words = cleaned.split()
    # Deduplicate while preserving order
    seen = set()
    keywords = []
    for w in words:
        if len(w) >= MIN_WORD_LENGTH and w not in STOP_WORDS and w not in seen:
            seen.add(w)
            keywords.append(w)
    return keywords


def match_score(keywords: list[str], market_text: str) -> int:
    """Count how many keywords appear in the market question/description."""
    market_lower = market_text.lower()
    return sum(1 for kw in keywords if kw in market_lower)


class RuleBasedSignalGenerator:
    """
    Generates signals using simple keyword matching rules.

    Conditions for signal generation:
    1. Event severity >= min_severity (default 5)
    2. At least MIN_KEYWORD_HITS keywords from the event match a market question
    3. The computed edge exceeds settings.mispricing_min_pct
    4. There is a recent market snapshot with a price

    This generator is designed to work completely without Ollama.
    """

    def __init__(self, min_severity: int = 5):
        self.min_severity = min_severity

    async def generate(
        self,
        db: AsyncSession,
        event: Event,
    ) -> list[Signal]:
        """Evaluate an event against all active markets and create signals."""
        severity = event.severity or 0
        if severity < self.min_severity:
            return []

        # Build keyword list: prefer existing keywords, fall back to extraction
        keywords = list(event.keywords or [])
        extracted = extract_keywords(event.raw_text or "")
        # Merge without duplicates
        existing_lower = {k.lower() for k in keywords}
        for kw in extracted:
            if kw.lower() not in existing_lower:
                keywords.append(kw)
                existing_lower.add(kw.lower())

        if not keywords:
            logger.debug(f"Rule-based: no keywords for event {event.id}")
            return []

        # Fetch active markets
        result = await db.execute(
            select(Market).where(Market.active == True).limit(300)
        )
        markets = result.scalars().all()

        if not markets:
            logger.debug("Rule-based: no active markets found")
            return []

        # Score each market by keyword overlap
        category = (event.category or "").upper()
        is_geopolitical = category in GEOPOLITICAL_CATEGORIES

        scored_markets = []
        for market in markets:
            search_text = f"{market.question} {market.description or ''}"
            search_lower = search_text.lower()

            # Skip sports/entertainment markets for geopolitical events
            if is_geopolitical and any(term in search_lower for term in SPORT_TERMS):
                continue

            score = match_score(keywords, search_text)
            # Require higher match score for non-geo terms to reduce noise
            if score < MIN_KEYWORD_HITS:
                continue
            # If score is only 1-2 and no GEO_TERM matched, skip (too weak)
            if score < 3:
                matched_kws = [kw for kw in keywords if kw.lower() in search_lower]
                has_geo = any(kw.lower() in GEO_TERMS for kw in matched_kws)
                if not has_geo:
                    continue
            scored_markets.append((market, score))

        # Sort by score descending
        scored_markets.sort(key=lambda x: x[1], reverse=True)

        # Batch fetch latest snapshot for all top markets in a single query
        top_markets = scored_markets[:10]
        top_market_ids = [m.id for m, _ in top_markets]
        snap_result = await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.market_id.in_(top_market_ids))
            .order_by(desc(MarketSnapshot.captured_at))
        )
        all_snaps = snap_result.scalars().all()
        # Keep only the most recent snapshot per market
        snapshots_by_market: dict[int, MarketSnapshot] = {}
        for snap in all_snaps:
            if snap.market_id not in snapshots_by_market:
                snapshots_by_market[snap.market_id] = snap

        signals = []
        for market, kw_score in top_markets:
            signal = await self._create_signal(
                db, event, market, kw_score, keywords,
                snapshot=snapshots_by_market.get(market.id)
            )
            if signal:
                signals.append(signal)

        if signals:
            logger.info(
                f"Rule-based: generated {len(signals)} signal(s) for event {event.id} "
                f"(severity={severity}, keywords={len(keywords)})"
            )

        return signals

    async def _create_signal(
        self,
        db: AsyncSession,
        event: Event,
        market: Market,
        kw_score: int,
        keywords: list[str],
        snapshot: "MarketSnapshot | None" = None,
    ) -> Signal | None:
        """Create a signal for a specific event-market pair."""
        if not snapshot or snapshot.price_yes is None:
            return None

        current_price = snapshot.price_yes
        # Skip markets with very low prices (illiquid / near-zero probability)
        if current_price < 0.03:
            return None
        severity = event.severity or 0

        # Estimate fair value: use severity and keyword score to compute a shift
        # Higher severity + more keyword matches = larger expected price movement
        severity_factor = (severity - 5) * 0.04  # severity 7 -> 0.08, severity 10 -> 0.20
        keyword_factor = min(kw_score * 0.02, 0.10)  # up to 0.10 from keywords
        shift = severity_factor + keyword_factor  # total shift magnitude

        # Clamp shift to reasonable bounds
        shift = max(0.05, min(0.35, shift))

        # Direction: high-severity events typically increase likelihood of
        # negative outcomes. If market is about a negative event happening,
        # push price up (more likely). Otherwise push down.
        category = (event.category or "").upper()
        negative_categories = {
            "MILITARY_CONFLICT", "NUCLEAR", "TERRORISM", "NATURAL_DISASTER",
            "CYBER_ATTACK", "EARTHQUAKE", "FIRE", "PANDEMIC_HEALTH",
            "AVIATION_INCIDENT",
        }

        if category in negative_categories:
            estimated_fv = min(0.95, current_price + shift)
        else:
            # For non-negative events, shift depends on context -- be conservative
            estimated_fv = max(0.05, min(0.95, current_price + shift * 0.5))

        # Compute edge (capped at 200% to avoid absurd values on low-price markets)
        if current_price > 0:
            edge = ((estimated_fv - current_price) / current_price) * 100
            edge = max(-200, min(200, edge))
        else:
            edge = 0

        # Compute confidence based on severity and keyword overlap
        # Base: 0.35, add up to 0.15 from severity, up to 0.15 from keywords
        confidence = 0.35 + (severity / 10) * 0.15 + min(kw_score * 0.03, 0.15)
        confidence = min(0.80, confidence)

        # Apply thresholds
        if abs(edge) < settings.mispricing_min_pct:
            return None
        if confidence < settings.signal_min_confidence:
            return None

        direction = "BUY_YES" if edge > 0 else "BUY_NO"

        # Classify signal strength
        abs_edge = abs(edge)
        if abs_edge > 30 and confidence > 0.7:
            signal_type = "STRONG_MISPRICING"
        elif abs_edge > 15:
            signal_type = "MODERATE_MISPRICING"
        elif confidence > 0.7:
            signal_type = "HIGH_CONFIDENCE"
        else:
            signal_type = "RULE_BASED_EDGE"

        # Build matched keywords for reasoning
        market_text = f"{market.question} {market.description or ''}".lower()
        matched = [kw for kw in keywords if kw.lower() in market_text]

        reasoning = (
            f"Rule-based signal: event severity={severity}, "
            f"keyword matches={kw_score} ({', '.join(matched[:5])}), "
            f"category={category or 'UNKNOWN'}, "
            f"current_price={current_price:.3f}, "
            f"estimated_fv={estimated_fv:.3f}, "
            f"edge={edge:.1f}%"
        )

        # Time sensitivity
        time_sensitivity = "normal"
        if market.end_date:
            hours_to_expiry = (market.end_date - datetime.now(timezone.utc)).total_seconds() / 3600
            if hours_to_expiry < 6:
                time_sensitivity = "urgent"
            elif hours_to_expiry < 24:
                time_sensitivity = "high"

        signal = Signal(
            event_id=event.id,
            market_id=market.id,
            signal_type=signal_type,
            current_price=current_price,
            estimated_fair_value=estimated_fv,
            edge_pct=abs_edge,
            confidence=confidence,
            direction=direction,
            time_sensitivity=time_sensitivity,
            reasoning=reasoning,
            status="active",
        )
        db.add(signal)
        await db.flush()

        return signal
