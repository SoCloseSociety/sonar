"""
API integration tests for SONAR Intelligence Terminal.
Run with: docker compose exec backend pytest tests/test_api.py -v
Defaults to in-container address (localhost:8000); override with TEST_API_URL.
"""
import httpx
import pytest

import os

BASE_URL = os.environ.get("TEST_API_URL", "http://localhost:8000/api")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL, timeout=15) as c:
        yield c


def test_events_severity_filter(client: httpx.Client):
    """severity_min=7 must return ONLY events with severity >= 7."""
    resp = client.get("/events", params={"severity_min": 7, "hours": 48, "limit": 50})
    assert resp.status_code == 200
    events = resp.json()
    assert isinstance(events, list)
    for e in events:
        assert e["severity"] >= 7, f"Event {e['id']} has severity {e['severity']} < 7"


def test_events_min_severity_alias(client: httpx.Client):
    """min_severity=7 must also work (frontend uses this param name)."""
    resp = client.get("/events", params={"min_severity": 7, "hours": 48, "limit": 50})
    assert resp.status_code == 200
    events = resp.json()
    for e in events:
        assert e["severity"] >= 7, f"Event {e['id']} has severity {e['severity']} < 7"


def test_events_not_null_entities(client: httpx.Client):
    """No event should have entities=null."""
    resp = client.get("/events", params={"hours": 24, "limit": 50})
    assert resp.status_code == 200
    for e in resp.json():
        assert e["entities"] is not None, f"Event {e['id']} has null entities"
        assert isinstance(e["entities"], dict), f"Event {e['id']} entities is not a dict"


def test_events_not_null_keywords(client: httpx.Client):
    """No event should have keywords=null."""
    resp = client.get("/events", params={"hours": 24, "limit": 50})
    assert resp.status_code == 200
    for e in resp.json():
        assert e["keywords"] is not None, f"Event {e['id']} has null keywords"
        assert isinstance(e["keywords"], list), f"Event {e['id']} keywords is not a list"


def test_entities_schema_consistent(client: httpx.Client):
    """All entities must have 'assets_impacted' and NOT 'assets_impact'."""
    resp = client.get("/events", params={"hours": 24, "limit": 50})
    assert resp.status_code == 200
    for e in resp.json():
        ent = e["entities"]
        assert "assets_impact" not in ent, f"Event {e['id']} has 'assets_impact' typo"
        assert "assets_impacted" in ent, f"Event {e['id']} missing 'assets_impacted'"
        assert "people" in ent
        assert "countries" in ent
        assert "organizations" in ent


def test_tension_score_valid(client: httpx.Client):
    """Tension score should be between 0 and 10."""
    resp = client.get("/dashboard/tension")
    assert resp.status_code == 200
    data = resp.json()
    assert "score" in data
    assert 0 <= data["score"] <= 10, f"Score {data['score']} out of range 0-10"
    assert data["level"] in ("CALM", "GUARDED", "ELEVATED", "HIGH", "CRITICAL")


def test_tension_history(client: httpx.Client):
    """Tension history should return a list of records."""
    resp = client.get("/dashboard/tension/history", params={"hours": 24})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for point in data:
        assert "score" in point
        assert "calculated_at" in point
        assert 0 <= point["score"] <= 10


def test_dashboard_stats(client: httpx.Client):
    """Dashboard stats should return expected fields."""
    resp = client.get("/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    for field in ("events_per_hour", "events_24h", "markets", "active_signals", "flights", "vessels"):
        assert field in data, f"Missing field: {field}"
        assert isinstance(data[field], (int, float))


def test_tracking_anomalies_format(client: httpx.Client):
    """Anomalies endpoint must return properly formatted items."""
    resp = client.get("/tracking/anomalies")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for a in data:
        assert "type" in a
        assert a["type"] in ("DARK_VESSEL", "UNIDENTIFIED_MILITARY_VESSEL", "NO_SQUAWK_MILITARY")
        assert "severity" in a
        assert 1 <= a["severity"] <= 10
        assert "description" in a
        assert "asset_id" in a
        assert "latitude" in a
        assert "longitude" in a
        assert "detected_at" in a


def test_sensitive_zones(client: httpx.Client):
    """Sensitive zones must return zones with risk scores."""
    resp = client.get("/map/sensitive-zones")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0, "No sensitive zones returned"
    for z in data:
        assert "name" in z
        assert "risk_score" in z
        assert 0 <= z["risk_score"] <= 10


def test_intel_endpoint(client: httpx.Client):
    """The /api/intel endpoint must return the briefing format."""
    resp = client.get("/intel")
    assert resp.status_code == 200
    data = resp.json()
    assert "generated_at" in data
    assert "threat_level" in data
    assert "top_events" in data
    assert isinstance(data["top_events"], list)
    assert "active_conflicts" in data
    assert "tension_history" in data


def test_signals_no_sports_military_mismatch(client: httpx.Client):
    """No signal on a sports market should come from a military event."""
    import re
    # Use word-boundary patterns to avoid false positives (e.g. "nfl" inside "conflict")
    SPORT_PATTERNS = [
        re.compile(r"\bnba\b"), re.compile(r"\bnfl\b"), re.compile(r"\bnhl\b"),
        re.compile(r"\bmlb\b"), re.compile(r"\bfifa\b"), re.compile(r"\bpremier league\b"),
        re.compile(r"\bchampions league\b"), re.compile(r"\bworld cup\b"),
        re.compile(r"\bsuper bowl\b"), re.compile(r"\bplayoffs\b"),
    ]

    resp = client.get("/signals", params={"limit": 100})
    assert resp.status_code == 200
    signals = resp.json()
    if not isinstance(signals, list):
        return  # API may wrap in object

    for sig in signals:
        reasoning = (sig.get("reasoning") or "").lower()
        # Check if signal mentions sports terms (word-boundary match)
        is_sports = any(pat.search(reasoning) for pat in SPORT_PATTERNS)
        if not is_sports:
            continue
        # Check if signal category suggests military origin
        category = (sig.get("category") or "").upper()
        is_military = category in {"MILITARY_CONFLICT", "NUCLEAR", "MARITIME_SECURITY", "CYBER_ATTACK", "TERRORISM"}
        if not is_military:
            # Also check reasoning text for category mention (with word boundaries)
            is_military = bool(re.search(r"\b(terrorism|nuclear|cyber.attack)\b", reasoning))
        if is_sports and is_military:
            pytest.fail(
                f"Signal {sig.get('id')} links a sports market to a military event: {reasoning[:100]}"
            )


def test_events_stream_endpoint(client: httpx.Client):
    """SSE stream endpoint should return text/event-stream."""
    with client.stream("GET", "/events/stream") as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        # Read first chunk (should be a ping or event)
        for line in resp.iter_lines():
            if line.startswith("data:"):
                break
        # If we get here, the stream is working
