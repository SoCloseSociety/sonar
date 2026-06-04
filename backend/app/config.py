from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "SONAR"
    app_env: str = "development"
    secret_key: str = "change-me"
    jwt_secret: str = "change-me"
    admin_username: str = "admin"

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "sonar"
    postgres_user: str = "sonar"
    postgres_password: str = "sonar_secret"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}"

    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "llama3.1:8b"

    # Telegram
    telegram_bot_token: str = ""
    telegram_admin_chat_id: str = ""
    telegram_api_id: str = ""
    telegram_api_hash: str = ""

    # Flight tracking
    opensky_username: str = ""
    opensky_password: str = ""
    adsb_exchange_api_key: str = ""

    # Vessel tracking
    aisstream_api_key: str = ""

    # NASA FIRMS
    nasa_firms_map_key: str = ""

    # Webcams
    windy_webcams_api_key: str = ""

    # Twitter
    twitter_bearer_token: str = ""

    # YouTube
    youtube_api_key: str = ""

    # ACLED (Armed Conflict Location & Event Data)
    acled_api_key: str = ""
    acled_email: str = ""

    # Shodan
    shodan_api_key: str = ""

    # Thresholds
    scan_interval_seconds: int = 120
    alert_min_severity: int = 6
    signal_min_confidence: float = 0.45
    mispricing_min_pct: float = 5.0
    tension_update_interval: int = 300
    flight_scan_interval: int = 180
    vessel_scan_interval: int = 180

    # Feature flags
    enable_rss: bool = True
    enable_gdelt: bool = True
    enable_twitter: bool = False
    enable_telegram_monitor: bool = False
    enable_flight_tracking: bool = True
    enable_vessel_tracking: bool = True
    enable_earthquake: bool = True
    enable_weather: bool = True
    enable_fire: bool = True
    enable_nuclear: bool = True
    enable_webcams: bool = True
    enable_polymarket: bool = True
    polymarket_api_key: str = ""
    polymarket_secret: str = ""
    polymarket_passphrase: str = ""
    enable_telegram_bot: bool = False
    enable_youtube: bool = True
    enable_reddit: bool = True
    enable_acled: bool = True
    enable_government_feeds: bool = True
    enable_conflict_monitor: bool = True
    enable_cyber_threats: bool = True
    enable_sanctions_trade: bool = True
    enable_shodan: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    import logging
    _log = logging.getLogger("sonar.config")
    s = Settings()
    if s.secret_key == "change-me":
        _log.warning("SECRET_KEY is using default value 'change-me' — set a strong secret in .env")
    if s.jwt_secret == "change-me":
        _log.warning("JWT_SECRET is using default value 'change-me' — set a strong secret in .env")
    if s.app_env == "production":
        weak = []
        if s.secret_key in ("change-me", ""):
            weak.append("SECRET_KEY")
        if s.jwt_secret in ("change-me", ""):
            weak.append("JWT_SECRET")
        if s.postgres_password in ("sonar_secret", "sonar_secret_change_me", "CHANGE_ME", ""):
            weak.append("POSTGRES_PASSWORD")
        if weak:
            raise RuntimeError(
                f"Cannot start in production with default/weak secrets: {', '.join(weak)}. "
                f"Generate strong values (openssl rand -hex 32) and set them in .env."
            )
    return s
