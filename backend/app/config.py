from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    session_ttl_days: int = 30
    upload_dir: str = "./data/uploads"


settings = Settings()
