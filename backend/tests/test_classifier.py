import pytest
from app.analyzer.dedup import compute_hash, is_duplicate
from app.analyzer.impact_scorer import ImpactScorer, CATEGORY_BASE_SCORES


def test_compute_hash_deterministic():
    """Test that hash is deterministic."""
    text = "Earthquake M7.2 in Turkey"
    assert compute_hash(text) == compute_hash(text)


def test_compute_hash_normalization():
    """Test that whitespace is normalized."""
    assert compute_hash("hello  world") == compute_hash("hello world")
    assert compute_hash("HELLO WORLD") == compute_hash("hello world")


def test_category_base_scores():
    """Test that all expected categories have base scores."""
    expected = ["MILITARY_CONFLICT", "NUCLEAR", "NATURAL_DISASTER", "SANCTIONS", "ELECTION"]
    for cat in expected:
        assert cat in CATEGORY_BASE_SCORES


@pytest.mark.asyncio
async def test_impact_scorer_fallback():
    """Test impact scoring with fallback (no Ollama)."""
    scorer = ImpactScorer()
    score = await scorer.score(
        text="Major earthquake hits region",
        category="NATURAL_DISASTER",
        severity=8,
        credibility=9.0,
        corroboration=3,
    )
    assert 0 <= score <= 100
    assert score > 30  # Should be relatively high for this input
