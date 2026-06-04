import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.database import async_session
from app.models.event import Event
from app.analyzer.classifier import OllamaClassifier
from app.analyzer.impact_scorer import ImpactScorer
from app.analyzer.correlation import MarketCorrelator
from app.polymarket.opportunity import OpportunityDetector
from app.analyzer.rule_based_signals import RuleBasedSignalGenerator, extract_keywords
from app.websocket import emit_event

logger = logging.getLogger(__name__)

# Keyword patterns for fast severity estimation (used when Ollama is unavailable)
_SEVERITY_HIGH = frozenset({
    "war", "attack", "explosion", "bomb", "missile", "strike", "killed", "dead",
    "deaths", "casualt", "nuclear", "chemical", "biological", "terror", "hijack",
    "invasion", "offensive", "airstrike", "artillery", "troops", "military",
    "coup", "assass", "massacre", "genocide", "earthquake", "tsunami", "hurricane",
    "conflict", "battle", "siege", "blitz", "warship", "combat", "hostage",
    "radiation", "meltdown", "reactor", "detonation", "catastrophe",
})
_SEVERITY_MEDIUM = frozenset({
    "protest", "riot", "unrest", "sanctions", "embargo", "crisis", "emergency",
    "accident", "fire", "flood", "storm", "drought", "famine", "outbreak",
    "arrest", "detained", "expel", "ambassador", "diplomatic", "escalat",
    "threat", "warning", "alert", "suspend", "blockade", "hack", "cyberattack",
    "shutdown", "collapse", "resign", "impeach", "election",
})


_KNOWN_ORGS = frozenset({
    "nato", "un", "eu", "iaea", "who", "imf", "world bank", "opec",
    "pentagon", "kremlin", "white house", "congress", "cia", "fbi", "nsa",
    "hamas", "hezbollah", "isis", "isil", "al-qaeda", "taliban",
    "idf", "irgc", "wagner", "pmc", "houthis",
    "reuters", "bbc", "cnn", "al jazeera",
})

_KNOWN_PEOPLE = frozenset({
    "trump", "biden", "putin", "zelensky", "xi jinping", "netanyahu",
    "khamenei", "erdogan", "modi", "macron", "scholz", "starmer",
    "kim jong un", "lavrov", "blinken", "austin", "sullivan",
    "guterres", "stoltenberg", "von der leyen",
})


def _extract_entities_basic(text: str, country: str | None) -> dict:
    """Fast regex-based entity extraction when Ollama is unavailable."""
    tl = text.lower()
    entities: dict[str, list[str]] = {
        "people": [], "countries": [], "organizations": [], "assets_impacted": [],
    }
    # Countries from geocoder
    from app.ingestion.geocoder import COUNTRY_CENTROIDS
    for cname in COUNTRY_CENTROIDS:
        if len(cname) > 2 and cname in tl:
            entities["countries"].append(cname.title())
    if country and country.title() not in entities["countries"]:
        entities["countries"].append(country.title())
    # Known organizations
    for org in _KNOWN_ORGS:
        if org in tl:
            entities["organizations"].append(org.upper() if len(org) <= 4 else org.title())
    # Known people
    for person in _KNOWN_PEOPLE:
        if person in tl:
            entities["people"].append(person.title())
    # Deduplicate
    for k in entities:
        entities[k] = list(dict.fromkeys(entities[k]))[:10]
    return entities


def _estimate_severity_from_text(text: str, source: str) -> int:
    """Fast keyword-based severity estimation when Ollama is unavailable."""
    tl = text.lower()
    # Trusted source overrides always get elevated severity
    if source in ("usgs_earthquake", "noaa_weather", "nasa_firms"):
        return 7
    high_hits = sum(1 for kw in _SEVERITY_HIGH if kw in tl)
    med_hits = sum(1 for kw in _SEVERITY_MEDIUM if kw in tl)
    if high_hits >= 3:
        return 9
    if high_hits >= 2:
        return 8
    if high_hits >= 1:
        return 7
    if med_hits >= 3:
        return 6
    if med_hits >= 1:
        return 5
    return 3


# Force correct category for events from dedicated data sources
SOURCE_CATEGORY_OVERRIDES: dict[str, str] = {
    "usgs_earthquake": "EARTHQUAKE",
    "noaa_weather": "WEATHER",
    "nasa_firms": "FIRE",
    "cyber_threats": "CYBER_ATTACK",
    "shodan": "CYBER_ATTACK",
}

# Check Ollama availability periodically (not per event)
_ollama_available: bool | None = None
_ollama_check_lock = asyncio.Lock()
_ollama_last_check: float = 0
OLLAMA_CHECK_INTERVAL = 120  # seconds


class AnalysisPipeline:
    """Main analysis pipeline: classify -> score -> correlate -> signal."""

    def __init__(self):
        self.classifier = OllamaClassifier()
        self.scorer = ImpactScorer()
        self.correlator = MarketCorrelator()
        self.opportunity = OpportunityDetector()
        self.rule_based = RuleBasedSignalGenerator(min_severity=5)

    async def _is_ollama_up(self) -> bool:
        """Check Ollama availability (cached for OLLAMA_CHECK_INTERVAL seconds)."""
        global _ollama_available, _ollama_last_check
        now = asyncio.get_event_loop().time()
        if _ollama_available is not None and (now - _ollama_last_check) < OLLAMA_CHECK_INTERVAL:
            return _ollama_available

        async with _ollama_check_lock:
            # Double-check after acquiring lock
            now = asyncio.get_event_loop().time()
            if _ollama_available is not None and (now - _ollama_last_check) < OLLAMA_CHECK_INTERVAL:
                return _ollama_available
            _ollama_available = await self.classifier.is_available()
            _ollama_last_check = now
            if not _ollama_available:
                logger.info("Ollama unavailable — using fallback scoring only")
            return _ollama_available

    async def process(self, event: Event, credibility: float = 5.0):
        """Process a single event through the full pipeline."""
        try:
            async with async_session() as db:
                result = await db.execute(select(Event).where(Event.id == event.id))
                ev = result.scalar_one_or_none()
                if not ev:
                    logger.warning(f"Event {event.id} not found for pipeline processing")
                    return

                ollama_up = await self._is_ollama_up()

                # Step 1: Classify (only if Ollama is available)
                if ollama_up:
                    classification = await self.classifier.classify(
                        text=ev.raw_text or "",
                        source=ev.source or "",
                        credibility=credibility,
                        timestamp=ev.created_at.isoformat() if ev.created_at else "",
                    )

                    # Detect Ollama refusals (returns summary like "I can't..." instead of proper classification)
                    is_refusal = False
                    if classification and isinstance(classification, dict):
                        summary = classification.get("summary", "") or ""
                        if summary.lower().startswith(("i can't", "i cannot", "i don't", "i'm unable")):
                            is_refusal = True
                            classification = None

                    if classification and isinstance(classification, dict) and not is_refusal:
                        ev.category = classification.get("category")
                        source_override = SOURCE_CATEGORY_OVERRIDES.get(ev.source or "")
                        if source_override:
                            ev.category = source_override
                        ev.severity = classification.get("severity", 0) or 0
                        ev.confidence = classification.get("confidence", 0) or 0
                        ev.summary = classification.get("summary")
                        ev.keywords = classification.get("keywords", [])
                        raw_entities = classification.get("entities")
                        if isinstance(raw_entities, dict):
                            # Normalize: fix assets_impact → assets_impacted
                            if "assets_impact" in raw_entities and "assets_impacted" not in raw_entities:
                                raw_entities["assets_impacted"] = raw_entities.pop("assets_impact")
                            elif "assets_impact" in raw_entities:
                                raw_entities.pop("assets_impact")
                            for k in ("people", "countries", "organizations", "assets_impacted"):
                                if k not in raw_entities:
                                    raw_entities[k] = []
                        ev.entities = raw_entities
                        ev.market_direction = classification.get("market_impact")

                        location = classification.get("location") or {}
                        if isinstance(location, dict):
                            country = location.get("country")
                            # Normalize: country may come as a list or comma-joined string from the LLM.
                            # The `country` column holds the primary country only; full list lives in entities.countries.
                            if isinstance(country, list):
                                country = country[0] if country else None
                            elif isinstance(country, str) and "," in country:
                                country = country.split(",")[0].strip()
                            if country:
                                ev.country = str(country)[:100]

                        if (
                            isinstance(location, dict)
                            and location.get("lat")
                            and location.get("lon")
                            and not ev.location
                        ):
                            from geoalchemy2.elements import WKTElement
                            try:
                                lat = float(location["lat"])
                                lon = float(location["lon"])
                                if -90 <= lat <= 90 and -180 <= lon <= 180:
                                    ev.location = WKTElement(f"POINT({lon} {lat})", srid=4326)
                            except (ValueError, TypeError):
                                pass
                    else:
                        # LLM returned nothing useful or refused — use fallback
                        logger.info(f"Ollama classification empty/refused for event {ev.id}, using fallback")
                        source_override = SOURCE_CATEGORY_OVERRIDES.get(ev.source or "")
                        if source_override:
                            ev.category = source_override
                        ev.summary = (ev.raw_text or "")[:200]
                        ev.severity = ev.severity or _estimate_severity_from_text(ev.raw_text or "", ev.source or "")
                        ev.confidence = 0.4
                        if not ev.keywords:
                            ev.keywords = extract_keywords(ev.raw_text or "")
                        if not ev.entities:
                            ev.entities = _extract_entities_basic(ev.raw_text or "", ev.country)
                else:
                    # Ollama down — use source-based category override if available
                    source_override = SOURCE_CATEGORY_OVERRIDES.get(ev.source or "")
                    if source_override:
                        ev.category = source_override
                    # Basic summary from raw text
                    ev.summary = (ev.raw_text or "")[:200]
                    # Use keyword-based severity estimation instead of flat fallback=3
                    # This ensures high-severity events still trigger rule-based signals
                    ev.severity = ev.severity or _estimate_severity_from_text(
                        ev.raw_text or "", ev.source or ""
                    )
                    ev.confidence = 0.4
                    # Extract keywords from raw text so correlation can work
                    if not ev.keywords:
                        ev.keywords = extract_keywords(ev.raw_text or "")
                    # Basic entity extraction fallback (no Ollama needed)
                    if not ev.entities:
                        ev.entities = _extract_entities_basic(ev.raw_text or "", ev.country)

                # Normalize dirty categories (compound slashes, typos, etc.)
                if ev.category:
                    cat = ev.category.strip().upper()
                    # Fix compound categories like "PROPAGANDA/MILITARY_CONFLICT"
                    if "/" in cat:
                        cat = cat.split("/")[-1].strip()
                    # Fix typos and variants
                    cat = cat.replace(" ", "_")
                    if cat.startswith("SPORTS"):
                        cat = "SPORTS_EVENT"
                    elif cat == "EQUITY_MARKET":
                        cat = "ECONOMIC_POLICY"
                    elif cat == "DIPLOMATIC_CONFLICT":
                        cat = "DIPLOMATIC"
                    ev.category = cat

                # Fill in country via reverse geocoding if still NULL
                if not ev.country and ev.location:
                    try:
                        from geoalchemy2.shape import to_shape
                        from app.ingestion.geocoder import reverse_geocode_country
                        pt = to_shape(ev.location)
                        rev_country = reverse_geocode_country(pt.y, pt.x)
                        if rev_country:
                            ev.country = rev_country
                    except Exception:
                        pass

                # Ensure severity is at least 1 for all classified events
                if ev.category and (ev.severity is None or ev.severity == 0):
                    ev.severity = _estimate_severity_from_text(ev.raw_text or "", ev.source or "")

                # Ensure confidence is at least 0.1
                if ev.confidence is not None and ev.confidence <= 0:
                    ev.confidence = 0.1

                # Step 2: Score impact (uses fallback if Ollama is down)
                ev.impact_score = await self.scorer.score(
                    text=ev.raw_text or "",
                    category=ev.category or "UNKNOWN",
                    severity=ev.severity or 0,
                    credibility=credibility,
                )

                ev.processed_at = datetime.now(timezone.utc)
                await db.commit()

                # Copy back
                event.category = ev.category
                event.severity = ev.severity
                event.summary = ev.summary
                event.impact_score = ev.impact_score

            # Step 3+4: Correlate + rule-based signals in a FRESH session
            # (avoids stale connection after commit above)
            async with async_session() as db2:
                # Step 3: Correlate with markets (severity >= 3)
                if (event.severity or 0) >= 3:
                    try:
                        correlations = await self.correlator.correlate(
                            db=db2,
                            text=event.raw_text or "",
                            category=event.category or "",
                            severity=event.severity or 0,
                            keywords=event.keywords or [],
                        )

                        for corr in correlations:
                            efv = corr.get("estimated_fair_value")
                            conf = corr.get("confidence", 0)
                            if efv is not None and conf >= 0.4:
                                market_id = corr.get("market_id")
                                if market_id:
                                    signal = await self.opportunity.evaluate(
                                        db=db2,
                                        market_id=market_id,
                                        estimated_fair_value=efv,
                                        confidence=conf,
                                        reasoning=corr.get("reasoning", ""),
                                        event_id=event.id,
                                    )
                                    if signal:
                                        try:
                                            await emit_event("signals", "new_signal", {
                                                "id": signal.id,
                                                "signal_type": signal.signal_type,
                                                "direction": signal.direction,
                                                "edge_pct": signal.edge_pct,
                                                "confidence": signal.confidence,
                                                "reasoning": signal.reasoning,
                                            })
                                        except Exception as e:
                                            logger.warning(f"Failed to emit correlation signal {signal.id}: {e}")

                        await db2.commit()
                    except Exception as e:
                        logger.warning(f"Correlation failed for event {event.id}: {e}")

                # Step 4: Rule-based signal generation (severity >= 5)
                if (event.severity or 0) >= 5:
                    try:
                        # Re-fetch event in this session for rule-based signals
                        result2 = await db2.execute(select(Event).where(Event.id == event.id))
                        ev2 = result2.scalar_one_or_none()
                        if ev2:
                            rule_signals = await self.rule_based.generate(db=db2, event=ev2)
                            for signal in rule_signals:
                                try:
                                    await emit_event("signals", "new_signal", {
                                        "id": signal.id,
                                        "signal_type": signal.signal_type,
                                        "direction": signal.direction,
                                        "edge_pct": signal.edge_pct,
                                        "confidence": signal.confidence,
                                        "reasoning": signal.reasoning,
                                    })
                                except Exception as e:
                                    logger.warning(f"Failed to emit rule signal {signal.id}: {e}")
                            if rule_signals:
                                await db2.commit()
                    except Exception as e:
                        logger.warning(f"Rule-based signals failed for event {event.id}: {e}")

            logger.debug(
                f"Processed event {event.id}: category={event.category}, "
                f"severity={event.severity}, impact={event.impact_score}"
            )

            # Step 5: Auto-trigger consensus analysis for critical events (severity >= 9)
            # Throttled: max 1 every 5 minutes to avoid pool exhaustion
            if (event.severity or 0) >= 9:
                now_ts = datetime.now(timezone.utc).timestamp()
                last_ts = getattr(self, '_last_consensus_trigger', 0)
                if now_ts - last_ts > 300:  # 5-minute cooldown
                    try:
                        self._last_consensus_trigger = now_ts
                        from app.analyzer.consensus_engine import ConsensusEngine
                        asyncio.create_task(ConsensusEngine().analyze_event(event.id))
                        logger.info(f"Auto-triggered consensus analysis for critical event {event.id}")
                    except Exception as e:
                        logger.warning(f"Failed to trigger consensus analysis for event {event.id}: {e}")

        except Exception as e:
            logger.error(f"Pipeline error for event {event.id}: {e}")
