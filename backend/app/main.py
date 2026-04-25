from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, simulate, voice
from app.config import get_settings

app = FastAPI(
    title="AlterEgo",
    description="Personal future simulation — voiced future-self interview",
    version="0.1.0",
)

settings = get_settings()
# Permissive CORS for hackathon dev — Vite picks 5173/5174/5175 dynamically.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(simulate.router, prefix="/simulate", tags=["simulate"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(voice.router, tags=["voice"])
