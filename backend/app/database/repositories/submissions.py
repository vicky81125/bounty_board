from typing import Any
from uuid import UUID

import asyncpg
from fastapi import HTTPException


async def create_pending(
    pool: asyncpg.Pool,
    sub_id: UUID,
    bounty_id: UUID,
    user_id: UUID,
    file_path: str,
    expires_at: Any,
) -> dict:
    """Insert an upload_pending row for Step 1 of the two-step zip upload."""
    row = await pool.fetchrow(
        """
        INSERT INTO submissions
          (id, bounty_id, user_id, status, submission_type, file_path,
           upload_token_expires_at, updated_at)
        VALUES ($1, $2, $3, 'upload_pending', 'zip', $4, $5, NOW())
        RETURNING *
        """,
        sub_id,
        bounty_id,
        user_id,
        file_path,
        expires_at,
    )
    return dict(row)


async def get_pending(pool: asyncpg.Pool, sub_id: UUID) -> dict | None:
    """Fetch an upload_pending row by its ID (the upload_token)."""
    row = await pool.fetchrow(
        "SELECT * FROM submissions WHERE id = $1 AND status = 'upload_pending'",
        sub_id,
    )
    return dict(row) if row else None


async def create(
    pool: asyncpg.Pool,
    *,
    bounty_id: UUID,
    user_id: UUID,
    submission_type: str,
    file_path: str | None,
    external_url: str | None,
    description: str,
    upload_token: UUID | None,
    max_per_user: int | None,
) -> dict:
    """
    Atomically check submission limit and create/promote submission.
    Uses SELECT FOR UPDATE to prevent race conditions.
    Raises HTTPException(409) if limit exceeded.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Lock the rows first, then count in Python — FOR UPDATE is incompatible with aggregates
            rows = await conn.fetch(
                """
                SELECT id FROM submissions
                WHERE bounty_id = $1 AND user_id = $2
                  AND status != 'rejected' AND status != 'upload_pending'
                FOR UPDATE
                """,
                bounty_id,
                user_id,
            )
            count = len(rows)
            if max_per_user is not None and count >= max_per_user:
                raise HTTPException(409, f"Submission limit reached ({max_per_user})")
            attempt_number = count + 1

            if upload_token:
                # Promote the upload_pending row to pending
                row = await conn.fetchrow(
                    """
                    UPDATE submissions
                    SET status = 'pending', description = $1,
                        attempt_number = $2, submitted_at = NOW(), updated_at = NOW()
                    WHERE id = $3 AND status = 'upload_pending'
                    RETURNING *
                    """,
                    description,
                    attempt_number,
                    upload_token,
                )
            else:
                row = await conn.fetchrow(
                    """
                    INSERT INTO submissions
                      (bounty_id, user_id, status, submission_type, external_url,
                       description, attempt_number, submitted_at, updated_at)
                    VALUES ($1, $2, 'pending', $3, $4, $5, $6, NOW(), NOW())
                    RETURNING *
                    """,
                    bounty_id,
                    user_id,
                    submission_type,
                    external_url,
                    description,
                    attempt_number,
                )

    if not row:
        raise HTTPException(409, "Submission creation failed — upload token may have expired")
    return dict(row)


async def get(pool: asyncpg.Pool, sub_id: UUID) -> dict | None:
    """Fetch a submission by ID with no additional scoping."""
    row = await pool.fetchrow("SELECT * FROM submissions WHERE id = $1", sub_id)
    return dict(row) if row else None


async def mark_scored(
    conn: asyncpg.Connection,
    sub_id: UUID,
    total_score: int,
    max_possible_score: int,
) -> None:
    """Set status='scored' and persist score totals. Must be called inside a transaction."""
    await conn.execute(
        """
        UPDATE submissions
        SET status = 'scored', total_score = $2, max_possible_score = $3,
            scored_at = NOW(), updated_at = NOW()
        WHERE id = $1
        """,
        sub_id,
        total_score,
        max_possible_score,
    )


async def get_by_id_and_bounty(
    pool: asyncpg.Pool, sub_id: UUID, bounty_id: UUID
) -> dict | None:
    row = await pool.fetchrow(
        "SELECT * FROM submissions WHERE id = $1 AND bounty_id = $2",
        sub_id,
        bounty_id,
    )
    return dict(row) if row else None


async def get_mine(pool: asyncpg.Pool, bounty_id: UUID, user_id: UUID) -> dict | None:
    """Get the user's latest non-upload_pending submission for a bounty."""
    row = await pool.fetchrow(
        """
        SELECT * FROM submissions
        WHERE bounty_id = $1 AND user_id = $2
          AND status != 'upload_pending'
        ORDER BY attempt_number DESC
        LIMIT 1
        """,
        bounty_id,
        user_id,
    )
    return dict(row) if row else None


async def list_mine(pool: asyncpg.Pool, bounty_id: UUID, user_id: UUID) -> list[dict]:
    """Get all of the user's non-upload_pending submissions for a bounty, newest first."""
    rows = await pool.fetch(
        """
        SELECT * FROM submissions
        WHERE bounty_id = $1 AND user_id = $2
          AND status != 'upload_pending'
        ORDER BY attempt_number DESC
        """,
        bounty_id,
        user_id,
    )
    return [dict(r) for r in rows]


async def update(
    pool: asyncpg.Pool, sub_id: UUID, description: str | None, external_url: str | None
) -> dict:
    parts = ["updated_at = NOW()"]
    values: list[Any] = []
    idx = 1

    if description is not None:
        parts.append(f"description = ${idx}")
        values.append(description)
        idx += 1
    if external_url is not None:
        parts.append(f"external_url = ${idx}")
        values.append(external_url)
        idx += 1

    values.append(sub_id)
    sql = f"UPDATE submissions SET {', '.join(parts)} WHERE id = ${idx} RETURNING *"
    row = await pool.fetchrow(sql, *values)
    return dict(row) if row else {}


async def update_fields(pool: asyncpg.Pool, sub_id: UUID, fields: dict[str, Any]) -> dict:
    """Update arbitrary columns. Pass explicit None to set a column to NULL."""
    if not fields:
        row = await pool.fetchrow("SELECT * FROM submissions WHERE id = $1", sub_id)
        return dict(row) if row else {}
    fields["updated_at"] = None  # will be overridden by literal below
    parts = ["updated_at = NOW()"]
    values: list[Any] = []
    idx = 1
    for col, val in fields.items():
        if col == "updated_at":
            continue
        parts.append(f"{col} = ${idx}")
        values.append(val)
        idx += 1
    values.append(sub_id)
    sql = f"UPDATE submissions SET {', '.join(parts)} WHERE id = ${idx} RETURNING *"
    row = await pool.fetchrow(sql, *values)
    return dict(row) if row else {}


async def delete_pending(pool: asyncpg.Pool, sub_id: UUID) -> None:
    """Delete an upload_pending row after its token has been consumed in an edit flow."""
    await pool.execute(
        "DELETE FROM submissions WHERE id = $1 AND status = 'upload_pending'",
        sub_id,
    )


async def get_for_org(
    pool: asyncpg.Pool, sub_id: UUID, org_id: UUID
) -> dict | None:
    """Get a submission scoped to an org via join on bounties.org_id (prevents cross-org IDOR)."""
    row = await pool.fetchrow(
        """
        SELECT s.*
        FROM submissions s
        JOIN bounties b ON b.id = s.bounty_id
        WHERE s.id = $1 AND b.org_id = $2
        """,
        sub_id,
        org_id,
    )
    return dict(row) if row else None


async def list_for_bounty(
    pool: asyncpg.Pool,
    bounty_id: UUID,
    org_id: UUID,
    status_filter: str | None = None,
) -> list[dict]:
    """List submissions for a bounty scoped to org. Excludes upload_pending."""
    base = """
        SELECT s.*, u.display_name AS user_display_name, u.email AS user_email
        FROM submissions s
        JOIN bounties b ON b.id = s.bounty_id
        JOIN users u ON u.id = s.user_id
        WHERE s.bounty_id = $1 AND b.org_id = $2
          AND s.status != 'upload_pending'
    """
    if status_filter:
        rows = await pool.fetch(
            base + " AND s.status = $3 ORDER BY s.submitted_at DESC",
            bounty_id,
            org_id,
            status_filter,
        )
    else:
        rows = await pool.fetch(
            base + " ORDER BY s.submitted_at DESC",
            bounty_id,
            org_id,
        )
    return [dict(r) for r in rows]


async def update_status(
    pool: asyncpg.Pool, sub_id: UUID, new_status: str, review_notes: str | None
) -> dict:
    set_parts = ["status = $2", "updated_at = NOW()"]
    values: list[Any] = [sub_id, new_status]
    idx = 3

    if review_notes is not None:
        set_parts.append(f"review_notes = ${idx}")
        values.append(review_notes)
        idx += 1

    # Set reviewed_at when transitioning from pending
    set_parts.append(f"reviewed_at = CASE WHEN status = 'pending' THEN NOW() ELSE reviewed_at END")

    sql = f"UPDATE submissions SET {', '.join(set_parts)} WHERE id = $1 RETURNING *"
    row = await pool.fetchrow(sql, *values)
    return dict(row) if row else {}


async def count_for_user(pool: asyncpg.Pool, bounty_id: UUID, user_id: UUID) -> int:
    """Counts non-rejected, non-upload_pending submissions. Rejected don't consume a slot."""
    return await pool.fetchval(
        """
        SELECT count(*) FROM submissions
        WHERE bounty_id = $1 AND user_id = $2
          AND status NOT IN ('rejected', 'upload_pending')
        """,
        bounty_id,
        user_id,
    )
