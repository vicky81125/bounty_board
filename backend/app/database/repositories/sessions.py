from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from app.models.session import Session


async def create(pool: asyncpg.Pool, **fields: Any) -> Session:
    columns = ", ".join(fields.keys())
    placeholders = ", ".join(f"${i + 1}" for i in range(len(fields)))
    row = await pool.fetchrow(
        f"INSERT INTO sessions ({columns}) VALUES ({placeholders}) RETURNING *",
        *fields.values(),
    )
    return Session(**dict(row))


async def get_by_session_id(pool: asyncpg.Pool, session_id: str) -> Session | None:
    row = await pool.fetchrow(
        """
        SELECT * FROM sessions
        WHERE session_id = $1
          AND is_revoked = false
          AND expires_at > NOW()
        """,
        session_id,
    )
    return Session(**dict(row)) if row else None


async def revoke(pool: asyncpg.Pool, session_id: str) -> None:
    await pool.execute(
        "UPDATE sessions SET is_revoked = true WHERE session_id = $1",
        session_id,
    )


async def revoke_all_for_user(pool: asyncpg.Pool, user_id: UUID) -> int:
    result = await pool.execute(
        "UPDATE sessions SET is_revoked = true WHERE user_id = $1 AND is_revoked = false",
        user_id,
    )
    # asyncpg returns "UPDATE N" as a string
    return int(result.split()[-1])


async def update_activity(
    pool: asyncpg.Pool,
    session_id: str,
    now: datetime,
    duration_days: int,
) -> None:
    """Extend expires_at and update last_activity. Throttle is enforced by the caller."""
    await pool.execute(
        """
        UPDATE sessions
        SET last_activity = $1::timestamptz,
            expires_at    = $1::timestamptz + ($2 || ' days')::INTERVAL
        WHERE session_id = $3
        """,
        now,
        str(duration_days),
        session_id,
    )
