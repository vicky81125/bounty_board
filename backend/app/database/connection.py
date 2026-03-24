from __future__ import annotations

import json

import asyncpg

from app.config import Settings


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register JSON/JSONB codecs so asyncpg decodes JSONB columns to Python objects."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def create_pool(settings: Settings) -> asyncpg.Pool:
    """Create asyncpg connection pool.

    statement_cache_size=0 is REQUIRED for Supavisor transaction mode —
    prepared statements are not supported across pooled connections.
    """
    return await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
        statement_cache_size=0,
        init=_init_connection,
    )
