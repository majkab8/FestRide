from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "sqlite:///./festride.db"
    frontend_origin: str = "http://localhost:5173"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_model: str = "gemini-flash-lite-latest"
    ai_timeout_seconds: float = 10.0
    ticketmaster_api_key: str = ""

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()
