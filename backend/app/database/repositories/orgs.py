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
