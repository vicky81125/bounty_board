from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg


async def get_membership(
    pool: asyncpg.Pool, org_id: UUID, user_id: UUID
) -> dict[str, Any] | None:
    """Return org_members row for this (org, user) pair, or None."""
    row = await pool.fetchrow(
        "SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2",
        org_id,
        user_id,
    )
    return dict(row) if row else None


async def create(
    pool: asyncpg.Pool,
    *,
    name: str,
    slug: str,
    created_by: UUID,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            org = await conn.fetchrow(
                """
                INSERT INTO orgs (id, name, slug, created_by, created_at)
                VALUES (gen_random_uuid(), $1, $2, $3, NOW())
                RETURNING *
                """,
                name,
                slug,
                created_by,
            )
            await conn.execute(
                """
                INSERT INTO org_members (org_id, user_id, role, joined_at)
                VALUES ($1, $2, 'admin', NOW())
                """,
                org["id"],
                created_by,
            )
    return dict(org)


async def get_by_id(pool: asyncpg.Pool, org_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM orgs WHERE id = $1", org_id)
    return dict(row) if row else None


async def slug_exists(pool: asyncpg.Pool, slug: str) -> bool:
    row = await pool.fetchrow("SELECT 1 FROM orgs WHERE slug = $1", slug)
    return row is not None


async def list_for_user(pool: asyncpg.Pool, user_id: UUID) -> list[dict[str, Any]]:
    """Return all orgs the user belongs to, ordered by joined_at."""
    rows = await pool.fetch(
        """
        SELECT o.*, om.role, om.joined_at AS member_since
        FROM orgs o
        JOIN org_members om ON om.org_id = o.id
        WHERE om.user_id = $1
        ORDER BY om.joined_at ASC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def list_members(pool: asyncpg.Pool, org_id: UUID) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT u.id AS user_id, u.display_name, u.email, u.username,
               u.avatar_url, om.role, om.joined_at
        FROM org_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
        ORDER BY om.joined_at ASC
        """,
        org_id,
    )
    return [dict(r) for r in rows]


async def add_member(
    pool: asyncpg.Pool,
    *,
    org_id: UUID,
    user_id: UUID,
    role: str,
) -> dict[str, Any]:
    row = await pool.fetchrow(
        """
        INSERT INTO org_members (org_id, user_id, role, joined_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *
        """,
        org_id,
        user_id,
        role,
    )
    return dict(row)


async def update_member_role(
    pool: asyncpg.Pool,
    *,
    org_id: UUID,
    user_id: UUID,
    role: str,
) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """
        UPDATE org_members SET role = $3
        WHERE org_id = $1 AND user_id = $2
        RETURNING *
        """,
        org_id,
        user_id,
        role,
    )
    return dict(row) if row else None


async def remove_member(
    pool: asyncpg.Pool,
    *,
    org_id: UUID,
    user_id: UUID,
) -> bool:
    result = await pool.execute(
        "DELETE FROM org_members WHERE org_id = $1 AND user_id = $2",
        org_id,
        user_id,
    )
    return result != "DELETE 0"


async def count_admins(pool: asyncpg.Pool, org_id: UUID) -> int:
    return await pool.fetchval(
        "SELECT count(*) FROM org_members WHERE org_id = $1 AND role = 'admin'",
        org_id,
    )
