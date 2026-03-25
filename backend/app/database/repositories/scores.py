import json
from typing import Any
from uuid import UUID

import asyncpg


async def upsert(
    conn: asyncpg.Connection,
    submission_id: UUID,
    data: dict[str, Any],
) -> dict:
    """Insert or update a score row. Must be called inside a transaction."""
    row = await conn.fetchrow(
        """
        INSERT INTO submission_scores
          (submission_id, scored_by, criteria_scores, total_score, max_possible_score, notes, updated_at)
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
        ON CONFLICT (submission_id) DO UPDATE SET
          scored_by          = EXCLUDED.scored_by,
          criteria_scores    = EXCLUDED.criteria_scores,
          total_score        = EXCLUDED.total_score,
          max_possible_score = EXCLUDED.max_possible_score,
          notes              = EXCLUDED.notes,
          updated_at         = NOW()
        RETURNING *
        """,
        submission_id,
        data["scored_by"],
        json.dumps(data["criteria_scores"]),
        data["total_score"],
        data["max_possible_score"],
        data.get("notes"),
    )
    return dict(row) if row else {}


async def get_by_submission(
    pool: asyncpg.Pool, submission_id: UUID
) -> dict | None:
    row = await pool.fetchrow(
        "SELECT * FROM submission_scores WHERE submission_id = $1",
        submission_id,
    )
    return dict(row) if row else None
