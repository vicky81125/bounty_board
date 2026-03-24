from __future__ import annotations

import asyncpg

from app.config import Settings


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
    )
