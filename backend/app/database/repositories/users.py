from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg


async def get_by_id(pool: asyncpg.Pool, user_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row) if row else None


async def get_by_email(pool: asyncpg.Pool, email: str) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM users WHERE email = $1", email.lower())
    return dict(row) if row else None


async def get_by_username(pool: asyncpg.Pool, username: str) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM users WHERE username = $1", username.lower())
    return dict(row) if row else None


async def create(pool: asyncpg.Pool, **fields: Any) -> dict[str, Any]:
    columns = ", ".join(fields.keys())
    placeholders = ", ".join(f"${i + 1}" for i in range(len(fields)))
    row = await pool.fetchrow(
        f"INSERT INTO users ({columns}) VALUES ({placeholders}) RETURNING *",
        *fields.values(),
    )
    return dict(row)


async def update(pool: asyncpg.Pool, user_id: UUID, **fields: Any) -> dict[str, Any] | None:
    if not fields:
        return await get_by_id(pool, user_id)
    assignments = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields.keys()))
    row = await pool.fetchrow(
        f"UPDATE users SET {assignments}, updated_at = NOW() WHERE id = $1 RETURNING *",
        user_id,
        *fields.values(),
    )
    return dict(row) if row else None


async def username_exists(pool: asyncpg.Pool, username: str) -> bool:
    row = await pool.fetchrow("SELECT 1 FROM users WHERE username = $1", username.lower())
    return row is not None
