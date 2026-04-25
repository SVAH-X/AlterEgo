from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import checkpoints, health, intake, interview, simulation
from app.config import get_settings
from app.db.client import close_mongo, connect_mongo


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await connect_mongo(settings.mongodb_uri, settings.mongodb_db)
    yield
    await close_mongo()


app = FastAPI(
    title="AlterEgo",
    description="OASIS-grounded personal future simulation",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(intake.router, prefix="/intake", tags=["intake"])
app.include_router(simulation.router, prefix="/simulation", tags=["simulation"])
app.include_router(checkpoints.router, prefix="/checkpoints", tags=["checkpoints"])
app.include_router(interview.router, prefix="/interview", tags=["interview"])
