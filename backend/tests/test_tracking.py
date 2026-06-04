import pytest
from app.ingestion.sources.vessel_tracker import VesselTrackerSource
from app.ingestion.sources.flight_tracker import FlightTrackerSource


def test_chokepoint_detection():
    """Test that chokepoint detection works correctly."""
    source = VesselTrackerSource()

    # Strait of Hormuz
    assert source._check_chokepoint(26.5, 56.5) == "Strait of Hormuz"

    # Taiwan Strait
    assert source._check_chokepoint(24.5, 119.0) == "Taiwan Strait"

    # Open ocean - no chokepoint
    assert source._check_chokepoint(0.0, 0.0) is None

    # Suez Canal
    assert source._check_chokepoint(30.5, 32.5) == "Suez Canal"


def test_military_callsign_detection():
    """Test military callsign detection."""
    source = FlightTrackerSource()

    assert source._is_military("FORTE10", "United States") is True
    assert source._is_military("DUKE01", "United States") is True
    assert source._is_military("RCH123", "United States") is True
    assert source._is_military("EXEC1F", "United States") is True

    # Commercial
    assert source._is_military("UAL123", "United States") is False
    assert source._is_military("BAW456", "United Kingdom") is False
