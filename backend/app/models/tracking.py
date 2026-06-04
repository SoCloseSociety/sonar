from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, Text, Index, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from geoalchemy2 import Geometry
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class FlightTrack(Base):
    __tablename__ = "flight_tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    icao24: Mapped[str] = mapped_column(String(6), nullable=False)
    callsign: Mapped[str | None] = mapped_column(String(10), nullable=True)
    aircraft_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    origin_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    velocity: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    vertical_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    squawk: Mapped[str | None] = mapped_column(String(4), nullable=True)
    is_military: Mapped[bool] = mapped_column(Boolean, default=False)
    is_government: Mapped[bool] = mapped_column(Boolean, default=False)
    captured_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    # GeoAlchemy2 auto-creates GiST index on 'position'
    __table_args__ = (
        Index("idx_flights_time", captured_at.desc()),
        Index("idx_flights_military", "is_military", captured_at.desc()),
    )


class VesselTrack(Base):
    __tablename__ = "vessel_tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    mmsi: Mapped[str] = mapped_column(String(9), nullable=False)
    vessel_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vessel_type: Mapped[int | None] = mapped_column(Integer, nullable=True)
    flag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    position = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    draft: Mapped[float | None] = mapped_column(Float, nullable=True)
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    imo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_military: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dark: Mapped[bool] = mapped_column(Boolean, default=False)
    captured_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    # GeoAlchemy2 auto-creates GiST index on 'position'
    __table_args__ = (
        Index("idx_vessels_time", captured_at.desc()),
        Index("idx_vessels_military", "is_military", captured_at.desc()),
        Index("idx_vessels_dark", "is_dark", captured_at.desc()),
    )


class TrackingAnomaly(Base):
    __tablename__ = "tracking_anomalies"

    id: Mapped[int] = mapped_column(primary_key=True)
    anomaly_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    severity: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_anomalies_time", detected_at.desc()),
    )
