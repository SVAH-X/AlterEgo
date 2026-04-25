from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, simulate
from app.config import get_settings

app = FastAPI(
    title="AlterEgo",
    description="Personal future simulation — voiced future-self interview",
    version="0.1.0",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(simulate.router, prefix="/simulate", tags=["simulate"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
