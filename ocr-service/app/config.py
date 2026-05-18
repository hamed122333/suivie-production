from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    port: int = 8000
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"
    # Même DATABASE_URL que le backend Node.js
    # Local:    postgresql://postgres:postgres@localhost:5432/suivi_production
    # Supabase: postgresql://postgres:[PWD]@db.[PROJECT].supabase.co:5432/postgres
    database_url: str = "postgresql://postgres:postgres@localhost:5432/suivi_production"

    # ── IA visuelle (NVIDIA NIM — API gratuite, compatible OpenAI) ──────────
    # Clé API obtenue sur https://build.nvidia.com (gratuit).
    # Si vide → le service utilise uniquement le pipeline OCR local.
    nvidia_api_key: str = ""
    vision_model: str = "meta/llama-3.2-90b-vision-instruct"
    vision_enabled: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Instance partagée
settings = get_settings()
