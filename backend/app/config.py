from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Inference plan: B = hosted APIs (default), A = local on ASUS GX10
    inference_plan: str = "B"

    # Anthropic (Plan B)
    # All tiers default to Haiku 4.5 during testing — cheapest + fastest in the
    # Claude family. Override per-tier in .env when polishing the demo (e.g.
    # ANTHROPIC_MODEL_FUTURE_SELF=claude-opus-4-7 for the simulation call).
    anthropic_api_key: str = ""
    anthropic_model_future_self: str = "claude-haiku-4-5"
    anthropic_model_high_signal: str = "claude-haiku-4-5"
    anthropic_model_peers: str = "claude-haiku-4-5"

    # Groq (Plan B noise tier; not used by the MVP path but kept for the router)
    groq_api_key: str = ""
    groq_model_noise: str = "llama-3.1-8b-instant"

    # GX10 (Plan A — only if hardware in hand; specific models TBD after bringup)
    gx10_base_url: str = "http://localhost:8001/v1"
    gx10_api_key: str = "local-no-key"
    gx10_model_future_self: str = ""
    gx10_model_high_signal: str = ""
    gx10_model_peers: str = ""
    gx10_model_noise: str = ""

    # ElevenLabs (voiced future-self interview)
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    # Gemini (image generation for aged portraits)
    # Absent api_key ⇒ portraits are silently skipped (agedPortraits=[]); the
    # rest of /simulate works unchanged.
    gemini_api_key: str = ""
    gemini_image_model: str = "gemini-2.5-flash-image"

    # Server
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
