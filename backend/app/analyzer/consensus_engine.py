"""
Consensus Intelligence Engine -- Multi-agent AI analysis system.

Simulates 10 specialized analyst archetypes that each evaluate an event
from their domain expertise, then aggregates into a consensus prediction.

When Ollama is available: each agent gets a unique prompt with its persona.
When Ollama is down: uses rule-based heuristics per agent archetype.

Agent Archetypes:
1. Military Strategist -- force disposition, escalation dynamics
2. Diplomatic Analyst -- treaties, alliances, negotiations
3. Economic Analyst -- sanctions impact, market contagion, supply chains
4. Intelligence Officer -- HUMINT/SIGINT patterns, covert operations
5. Cyber Warfare Specialist -- digital threats, infrastructure vulnerabilities
6. Energy & Resources Analyst -- oil, gas, critical minerals, energy security
7. Regional Expert -- cultural context, historical patterns, local dynamics
8. Risk Analyst -- probability assessment, scenario modeling
9. Media & Narrative Analyst -- propaganda detection, information warfare
10. Predictive Modeler -- quantitative signals, trend extrapolation
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session
from app.models.analysis import Analysis
from app.models.event import Event
from app.models.market import Market, MarketSnapshot

logger = logging.getLogger(__name__)
settings = get_settings()

AGENT_ARCHETYPES = [
    {
        "id": "military_strategist",
        "name": "Military Strategist",
        "icon": "shield",
        "focus": "Force disposition, escalation dynamics, military capabilities, order of battle",
        "bias": "Tends to assess threats as higher; focused on worst-case scenarios",
        "categories": ["MILITARY_CONFLICT", "ARMS_CONTROL", "NUCLEAR", "AVIATION_INCIDENT"],
    },
    {
        "id": "diplomatic_analyst",
        "name": "Diplomatic Analyst",
        "icon": "handshake",
        "focus": "Treaties, alliances, diplomatic channels, negotiation leverage, international law",
        "bias": "Tends to see de-escalation paths; focused on diplomatic solutions",
        "categories": ["DIPLOMATIC", "SANCTIONS", "ELECTION", "POLITICAL_DOMESTIC"],
    },
    {
        "id": "economic_analyst",
        "name": "Economic Analyst",
        "icon": "chart",
        "focus": "Sanctions impact, market contagion, supply chain disruption, trade flows",
        "bias": "Focused on economic consequences; may underweight military factors",
        "categories": ["ECONOMIC_POLICY", "TRADE_DISRUPTION", "CRYPTO_MARKET", "ENERGY_COMMODITIES"],
    },
    {
        "id": "intel_officer",
        "name": "Intelligence Officer",
        "icon": "eye",
        "focus": "Pattern recognition, covert operations, deception analysis, source reliability",
        "bias": "Skeptical of open-source info; looks for hidden motives",
        "categories": ["ESPIONAGE", "TERRORISM", "MILITARY_CONFLICT"],
    },
    {
        "id": "cyber_specialist",
        "name": "Cyber Warfare Specialist",
        "icon": "terminal",
        "focus": "Digital threats, APT groups, infrastructure vulnerabilities, information operations",
        "bias": "May overestimate cyber risks; focused on digital attack vectors",
        "categories": ["CYBER_ATTACK", "TECHNOLOGY", "INFRASTRUCTURE"],
    },
    {
        "id": "energy_analyst",
        "name": "Energy & Resources Analyst",
        "icon": "bolt",
        "focus": "Oil/gas markets, critical minerals, energy security, chokepoints, pipeline politics",
        "bias": "Focused on resource competition; may overweight energy factors",
        "categories": ["ENERGY_COMMODITIES", "MARITIME_SECURITY", "TRADE_DISRUPTION"],
    },
    {
        "id": "regional_expert",
        "name": "Regional Expert",
        "icon": "globe",
        "focus": "Cultural context, historical patterns, ethnic dynamics, local power structures",
        "bias": "Deep contextual understanding; may miss global systemic effects",
        "categories": ["POLITICAL_DOMESTIC", "MILITARY_CONFLICT", "ELECTION"],
    },
    {
        "id": "risk_analyst",
        "name": "Risk Analyst",
        "icon": "gauge",
        "focus": "Probability assessment, scenario modeling, tail risks, cascading failures",
        "bias": "Quantitative; may underweight qualitative intelligence",
        "categories": ["NATURAL_DISASTER", "PANDEMIC_HEALTH", "EARTHQUAKE", "WEATHER", "FIRE"],
    },
    {
        "id": "narrative_analyst",
        "name": "Media & Narrative Analyst",
        "icon": "megaphone",
        "focus": "Propaganda detection, information warfare, social media amplification, framing analysis",
        "bias": "Skeptical of narratives; looks for manufactured consent or disinformation",
        "categories": ["POLITICAL_DOMESTIC", "ELECTION", "MILITARY_CONFLICT"],
    },
    {
        "id": "predictive_modeler",
        "name": "Predictive Modeler",
        "icon": "brain",
        "focus": "Quantitative signals, trend extrapolation, base rates, historical analogs",
        "bias": "Data-driven; may miss black swan events or paradigm shifts",
        "categories": ["CRYPTO_MARKET", "ECONOMIC_POLICY", "ELECTION"],
    },
]


def _build_agent_prompt(agent: dict, event_text: str, event_category: str,
                         event_severity: int, event_country: str,
                         related_events: list[str], market_context: str) -> str:
    """Build a persona-specific analysis prompt for one agent."""
    return f"""You are {agent['name']}, a senior intelligence analyst specializing in: {agent['focus']}.

Known bias: {agent['bias']}

Analyze this intelligence event and provide your expert assessment. Be specific, concise, and actionable.

EVENT:
{event_text}

CATEGORY: {event_category}
SEVERITY: {event_severity}/10
COUNTRY/REGION: {event_country or 'Unknown'}

RELATED RECENT EVENTS:
{chr(10).join(f'- {e}' for e in related_events[:5]) if related_events else '- No related events available'}

MARKET CONTEXT:
{market_context or 'No market data available'}

Respond ONLY in valid JSON:
{{
  "assessment": "Your 2-3 sentence expert analysis from your specialty perspective",
  "severity_estimate": 1-10,
  "confidence": 0.0-1.0,
  "direction": "escalation" or "de-escalation" or "stable" or "volatile",
  "key_factors": ["factor1", "factor2", "factor3"],
  "prediction": "What happens next (24-72h outlook)",
  "prediction_probability": 0.0-1.0,
  "dissent": "Where you disagree with conventional wisdom (if any)"
}}"""


class ConsensusEngine:
    """Multi-agent consensus analysis system."""

    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model

    async def analyze_event(self, event_id: int) -> Analysis | None:
        """Run full multi-agent analysis on a single event."""
        start = time.monotonic()

        async with async_session() as db:
            # Fetch event
            result = await db.execute(select(Event).where(Event.id == event_id))
            event = result.scalar_one_or_none()
            if not event:
                logger.warning(f"Event {event_id} not found for analysis")
                return None

            # Fetch related events (same category, last 24h)
            related_q = await db.execute(
                select(Event.summary)
                .where(Event.category == event.category)
                .where(Event.id != event.id)
                .where(Event.severity >= 5)
                .order_by(desc(Event.created_at))
                .limit(5)
            )
            related_events = [r[0] for r in related_q.all() if r[0]]

            # Fetch market context (correlated markets)
            market_context = await self._get_market_context(db, event)

            # Run all agents
            text = event.raw_text or event.summary or ""
            category = event.category or "UNKNOWN"
            severity = event.severity or 5
            country = event.country or ""

            assessments = await self._run_agents(
                text, category, severity, country, related_events, market_context
            )

            if not assessments:
                logger.warning(f"No agent assessments produced for event {event_id}")
                return None

            # Aggregate consensus
            consensus = self._aggregate_consensus(assessments)

            # Build analysis record
            elapsed = int((time.monotonic() - start) * 1000)
            analysis = Analysis(
                event_id=event_id,
                analysis_type="event_analysis",
                title=f"Multi-Agent Analysis: {(event.summary or text)[:200]}",
                summary=consensus["summary"],
                agent_assessments={"agents": assessments},
                consensus_severity=consensus["severity"],
                consensus_confidence=consensus["confidence"],
                consensus_direction=consensus["direction"],
                prediction=consensus["prediction"],
                prediction_probability=consensus["prediction_probability"],
                prediction_timeframe="72h",
                agent_count=len(assessments),
                model_used=self.model,
                processing_time_ms=elapsed,
                categories=[category],
                entities_mentioned=event.entities,
            )

            # Market calibration if available
            if consensus.get("market_id"):
                analysis.market_id = consensus["market_id"]
                analysis.market_price_at_analysis = consensus.get("market_price")
                analysis.predicted_fair_value = consensus.get("predicted_fv")

            db.add(analysis)
            await db.commit()
            await db.refresh(analysis)

            logger.info(
                f"Consensus analysis #{analysis.id} for event {event_id}: "
                f"severity={consensus['severity']:.1f}, confidence={consensus['confidence']:.2f}, "
                f"direction={consensus['direction']}, agents={len(assessments)}, "
                f"time={elapsed}ms"
            )
            return analysis

    async def analyze_situation(self, topic: str, hours: int = 48) -> Analysis | None:
        """Run broad situational analysis on a topic across recent events."""
        start = time.monotonic()

        async with async_session() as db:
            from datetime import timedelta
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

            # Fetch relevant events
            topic_lower = topic.lower()
            result = await db.execute(
                select(Event)
                .where(Event.created_at > cutoff)
                .where(Event.severity >= 5)
                .order_by(desc(Event.severity), desc(Event.created_at))
                .limit(50)
            )
            all_events = result.scalars().all()

            # Filter by topic relevance
            relevant = []
            for e in all_events:
                text = ((e.summary or "") + " " + (e.country or "") + " " + " ".join(e.keywords or [])).lower()
                if topic_lower in text or any(w in text for w in topic_lower.split()):
                    relevant.append(e)
            relevant = relevant[:15]

            if not relevant:
                logger.warning(f"No relevant events found for topic: {topic}")
                return None

            # Build situation summary
            situation_text = f"SITUATION BRIEFING: {topic}\n\nRelevant intelligence ({len(relevant)} events):\n"
            for i, e in enumerate(relevant[:10], 1):
                situation_text += f"{i}. [{e.category}] SEV={e.severity} ({e.country or '?'}): {e.summary or (e.raw_text or '')[:150]}\n"

            market_context = ""
            assessments = await self._run_agents(
                situation_text, "MULTI_CATEGORY", 7, topic, [], market_context
            )

            if not assessments:
                return None

            consensus = self._aggregate_consensus(assessments)
            elapsed = int((time.monotonic() - start) * 1000)

            analysis = Analysis(
                analysis_type="threat_assessment",
                title=f"Threat Assessment: {topic}",
                summary=consensus["summary"],
                agent_assessments={"agents": assessments},
                consensus_severity=consensus["severity"],
                consensus_confidence=consensus["confidence"],
                consensus_direction=consensus["direction"],
                prediction=consensus["prediction"],
                prediction_probability=consensus["prediction_probability"],
                prediction_timeframe="7d",
                agent_count=len(assessments),
                model_used=self.model,
                processing_time_ms=elapsed,
                categories=list({e.category for e in relevant if e.category}),
            )

            db.add(analysis)
            await db.commit()
            await db.refresh(analysis)
            return analysis

    async def _run_agents(self, text: str, category: str, severity: int,
                          country: str, related: list[str], market_ctx: str) -> list[dict]:
        """Run all 10 agents. Uses Ollama if available, else rule-based fallback."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                resp.raise_for_status()
                ollama_up = True
        except Exception:
            ollama_up = False

        if ollama_up:
            return await self._run_agents_ollama(text, category, severity, country, related, market_ctx)
        else:
            return self._run_agents_fallback(text, category, severity, country)

    async def _run_agents_ollama(self, text: str, category: str, severity: int,
                                  country: str, related: list[str], market_ctx: str) -> list[dict]:
        """Run agents via Ollama LLM -- parallel calls for speed."""
        tasks = []
        for agent in AGENT_ARCHETYPES:
            prompt = _build_agent_prompt(agent, text, category, severity, country, related, market_ctx)
            tasks.append(self._call_agent_ollama(agent, prompt))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        assessments = []
        for agent, result in zip(AGENT_ARCHETYPES, results):
            if isinstance(result, Exception):
                logger.warning(f"Agent {agent['name']} failed: {result}")
                # Use fallback for this agent
                fb = self._agent_fallback(agent, text, category, severity, country)
                assessments.append(fb)
            elif result:
                assessments.append(result)

        return assessments

    async def _call_agent_ollama(self, agent: dict, prompt: str) -> dict | None:
        """Call Ollama for a single agent assessment."""
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": self.model, "prompt": prompt, "stream": False, "format": "json"},
                )
                resp.raise_for_status()
                data = resp.json()
                response_text = data.get("response", "")
                if not response_text.strip():
                    return None
                parsed = json.loads(response_text)
                if isinstance(parsed, dict):
                    parsed["agent_id"] = agent["id"]
                    parsed["agent_name"] = agent["name"]
                    parsed["agent_icon"] = agent["icon"]
                    # Clamp values
                    parsed["severity_estimate"] = max(1, min(10, int(parsed.get("severity_estimate", 5))))
                    parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
                    parsed["prediction_probability"] = max(0.0, min(1.0, float(parsed.get("prediction_probability", 0.5))))
                    return parsed
        except json.JSONDecodeError:
            logger.warning(f"Agent {agent['name']} returned invalid JSON")
        except Exception as e:
            logger.warning(f"Agent {agent['name']} call failed: {e}")
        return None

    def _run_agents_fallback(self, text: str, category: str, severity: int, country: str) -> list[dict]:
        """Rule-based agent fallback when Ollama is unavailable."""
        return [self._agent_fallback(a, text, category, severity, country) for a in AGENT_ARCHETYPES]

    def _agent_fallback(self, agent: dict, text: str, category: str,
                         severity: int, country: str) -> dict:
        """Single agent rule-based assessment."""
        tl = text.lower()

        # Category relevance weight
        relevance = 1.0 if category in agent["categories"] else 0.6

        # Keyword-based severity adjustment per agent type
        sev_adj = 0
        if agent["id"] == "military_strategist":
            mil_kw = ["attack", "strike", "troops", "missile", "offensive", "war", "invasion"]
            sev_adj = min(2, sum(1 for k in mil_kw if k in tl))
        elif agent["id"] == "diplomatic_analyst":
            dip_kw = ["ceasefire", "negotiate", "peace", "talks", "agreement", "treaty"]
            sev_adj = -min(2, sum(1 for k in dip_kw if k in tl))
        elif agent["id"] == "economic_analyst":
            eco_kw = ["sanctions", "tariff", "oil price", "supply chain", "inflation", "recession"]
            sev_adj = min(1, sum(1 for k in eco_kw if k in tl))
        elif agent["id"] == "cyber_specialist":
            cyber_kw = ["hack", "breach", "malware", "ransomware", "zero-day", "apt", "exploit"]
            sev_adj = min(2, sum(1 for k in cyber_kw if k in tl))

        agent_sev = max(1, min(10, severity + sev_adj))
        agent_conf = min(0.85, 0.4 + relevance * 0.2 + (severity / 20))

        # Direction based on keywords
        escalation_kw = ["escalat", "attack", "offensive", "strike", "deploy", "mobiliz", "war"]
        deescalation_kw = ["ceasefire", "withdraw", "peace", "talks", "negotiate", "agreement"]
        esc_count = sum(1 for k in escalation_kw if k in tl)
        deesc_count = sum(1 for k in deescalation_kw if k in tl)
        if esc_count > deesc_count + 1:
            direction = "escalation"
        elif deesc_count > esc_count + 1:
            direction = "de-escalation"
        elif esc_count > 0 and deesc_count > 0:
            direction = "volatile"
        else:
            direction = "stable"

        return {
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "agent_icon": agent["icon"],
            "assessment": f"[Rule-based] {agent['name']} assessment based on keyword analysis of {category} event in {country or 'unknown region'}.",
            "severity_estimate": agent_sev,
            "confidence": round(agent_conf, 3),
            "direction": direction,
            "key_factors": [category.replace("_", " ").lower(), country or "unspecified region"],
            "prediction": f"Situation likely to remain {direction} in the next 72 hours based on current indicators.",
            "prediction_probability": round(min(0.8, agent_conf + 0.1), 3),
            "dissent": None,
        }

    def _aggregate_consensus(self, assessments: list[dict]) -> dict:
        """Aggregate all agent assessments into a consensus."""
        if not assessments:
            return {
                "severity": 5.0, "confidence": 0.5, "direction": "stable",
                "summary": "No assessments available", "prediction": "Insufficient data",
                "prediction_probability": 0.5,
            }

        # Weighted average (higher confidence agents get more weight)
        total_weight = 0
        sev_sum = 0
        conf_sum = 0
        pred_prob_sum = 0
        direction_votes: dict[str, float] = {}

        for a in assessments:
            weight = a.get("confidence", 0.5)
            total_weight += weight
            sev_sum += a.get("severity_estimate", 5) * weight
            conf_sum += a.get("confidence", 0.5) * weight
            pred_prob_sum += a.get("prediction_probability", 0.5) * weight
            d = a.get("direction", "stable")
            direction_votes[d] = direction_votes.get(d, 0) + weight

        w = max(total_weight, 0.01)
        avg_sev = round(sev_sum / w, 1)
        avg_conf = round(conf_sum / w, 3)
        avg_pred = round(pred_prob_sum / w, 3)
        direction = max(direction_votes, key=direction_votes.get) if direction_votes else "stable"

        # Build summary from top 3 assessments by confidence
        top_agents = sorted(assessments, key=lambda x: x.get("confidence", 0), reverse=True)[:3]
        summary_parts = [a.get("assessment", "") for a in top_agents if a.get("assessment")]
        summary = " | ".join(summary_parts)

        # Aggregate predictions
        predictions = [a.get("prediction", "") for a in assessments if a.get("prediction")]
        prediction = predictions[0] if predictions else "No prediction available"

        # Dissent tracking
        dissents = [a for a in assessments if a.get("dissent") and a["dissent"] not in (None, "", "None")]

        return {
            "severity": avg_sev,
            "confidence": avg_conf,
            "direction": direction,
            "summary": summary[:1000],
            "prediction": prediction,
            "prediction_probability": avg_pred,
            "dissent_count": len(dissents),
        }

    async def _get_market_context(self, db: AsyncSession, event: Event) -> str:
        """Build market context string for agent prompts."""
        try:
            keywords = event.keywords or []
            if not keywords:
                return ""

            # Find markets matching event keywords
            result = await db.execute(
                select(Market).where(Market.active == True).limit(100)
            )
            markets = result.scalars().all()

            matches = []
            text_lower = ((event.summary or "") + " " + " ".join(keywords)).lower()
            for m in markets:
                q_lower = m.question.lower()
                if any(kw.lower() in q_lower for kw in keywords if len(kw) >= 3):
                    # Get latest price
                    snap_r = await db.execute(
                        select(MarketSnapshot)
                        .where(MarketSnapshot.market_id == m.id)
                        .order_by(desc(MarketSnapshot.captured_at))
                        .limit(1)
                    )
                    snap = snap_r.scalar_one_or_none()
                    price = f"{snap.price_yes:.0%}" if snap and snap.price_yes else "N/A"
                    matches.append(f"- {m.question} (current price: {price})")

            if matches:
                return "Related prediction markets:\n" + "\n".join(matches[:5])
        except Exception as e:
            logger.warning(f"Market context fetch failed: {e}")
        return ""
