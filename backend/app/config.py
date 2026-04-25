from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Inference plan
    inference_plan: str = "B"

    # Anthropic (Plan B)
    anthropic_api_key: str = ""
    anthropic_model_future_self: str = "claude-opus-4-7"
    anthropic_model_high_signal: str = "claude-sonnet-4-6"
    anthropic_model_peers: str = "claude-haiku-4-5"

    # Groq (Plan B noise)
    groq_api_key: str = ""
    groq_model_noise: str = "llama-3.1-8b-instant"

    # GX10 (Plan A)
    gx10_base_url: str = "http://localhost:8001/v1"
    gx10_api_key: str = "local-no-key"
    gx10_model_future_self: str = ""
    gx10_model_high_signal: str = ""
    gx10_model_peers: str = ""
    gx10_model_noise: str = ""

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    # Mongo
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "alterego"

    # Cloudinary
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # Replicate
    replicate_api_token: str = ""

    # Ready Player Me
    ready_player_me_subdomain: str = ""

    # GDELT
    gdelt_api_base: str = "https://api.gdeltproject.org/api/v2"

    # Agentverse (optional)
    agentverse_api_key: str = ""
    agent_seed: str = ""

    # Server
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
