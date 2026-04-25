from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_mongo(uri: str, db_name: str) -> None:
    global _client, _db
    _client = AsyncIOMotorClient(uri)
    _db = _client[db_name]


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Mongo not connected. Call connect_mongo() in lifespan.")
    return _db
