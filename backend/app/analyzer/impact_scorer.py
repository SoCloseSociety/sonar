import logging

logger = logging.getLogger(__name__)

# Scoring when Ollama is unavailable (always used now — LLM scoring removed to save CPU)
CATEGORY_BASE_SCORES = {
    "MILITARY_CONFLICT": 70,
    "NUCLEAR": 80,
    "TERRORISM": 65,
    "NATURAL_DISASTER": 50,
    "SANCTIONS": 45,
    "DIPLOMATIC": 35,
    "ECONOMIC_POLICY": 40,
    "MARITIME_SECURITY": 50,
    "AVIATION_INCIDENT": 55,
    "ELECTION": 30,
    "POLITICAL_DOMESTIC": 25,
    "ENERGY_COMMODITIES": 35,
    "CRYPTO_MARKET": 25,
    "TECHNOLOGY": 20,
    "INFRASTRUCTURE": 30,
    "PANDEMIC_HEALTH": 40,
    "CYBER_ATTACK": 55,
    "EARTHQUAKE": 45,
    "WEATHER": 40,
    "FIRE": 45,
}


class ImpactScorer:
    async def score(
        self, text: str, category: str, severity: int, credibility: float, corroboration: int = 0
    ) -> int:
        """Formula-based impact scoring (0-100). No LLM call needed."""
        base = CATEGORY_BASE_SCORES.get(category, 30)

        # Source credibility (25%)
        cred_factor = (credibility / 10) * 25

        # Severity factor (25%)
        sev_factor = (severity / 10) * 25

        # Corroboration (20%)
        corr_factor = min(corroboration * 5, 20)

        # Novelty (15%)
        novelty_factor = 15 if corroboration == 0 else max(0, 15 - corroboration * 3)

        # Category base (15%)
        cat_factor = (base / 100) * 15

        total = cred_factor + sev_factor + corr_factor + novelty_factor + cat_factor
        return min(100, max(0, int(total)))
