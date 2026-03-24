from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg


async def create(
    pool: asyncpg.Pool,
    *,
    org_id: UUID,
    created_by: UUID,
    data: dict[str, Any],
) -> dict[str, Any]:
    row = await pool.fetchrow(
        """
        INSERT INTO bounties (
            org_id, created_by, title, description_md, ideal_output_md,
            start_date, end_date, difficulty, tags, skills_required,
            submission_formats, rubric, status, prize, resources,
            eligibility_notes, max_submissions_per_user,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::jsonb,
            $11, $12::jsonb, $13, $14::jsonb, $15::jsonb,
            $16, $17,
            NOW(), NOW()
        ) RETURNING *
        """,
        org_id,
        created_by,
        data["title"],
        data.get("description_md", ""),
        data.get("ideal_output_md", ""),
        data.get("start_date"),
        data.get("end_date"),
        data.get("difficulty", "medium"),
        data.get("tags", []),
        data.get("skills_required", []),
        data.get("submission_formats", []),
        data.get("rubric", []),
        data.get("status", "draft"),
        data.get("prize"),
        data.get("resources", []),
        data.get("eligibility_notes"),
        data.get("max_submissions_per_user"),
    )
    return dict(row)


async def get_by_id(pool: asyncpg.Pool, bounty_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """
        SELECT b.*, o.name AS org_name
        FROM bounties b
        JOIN orgs o ON o.id = b.org_id
        WHERE b.id = $1
        """,
        bounty_id,
    )
    return dict(row) if row else None


async def get_for_org(
    pool: asyncpg.Pool, bounty_id: UUID, org_id: UUID
) -> dict[str, Any] | None:
    """Fetch a bounty scoped to a specific org. Returns None if bounty doesn't belong to org."""
    row = await pool.fetchrow(
        """
        SELECT b.*, o.name AS org_name
        FROM bounties b
        JOIN orgs o ON o.id = b.org_id
        WHERE b.id = $1 AND b.org_id = $2
        """,
        bounty_id,
        org_id,
    )
    return dict(row) if row else None


async def list_org_bounties(
    pool: asyncpg.Pool,
    org_id: UUID,
    *,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """Return all bounties for an org (including drafts), optionally filtered by status."""
    if status:
        rows = await pool.fetch(
            """
            SELECT b.*, o.name AS org_name
            FROM bounties b
            JOIN orgs o ON o.id = b.org_id
            WHERE b.org_id = $1 AND b.status = $2
            ORDER BY b.created_at DESC
            """,
            org_id,
            status,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT b.*, o.name AS org_name
            FROM bounties b
            JOIN orgs o ON o.id = b.org_id
            WHERE b.org_id = $1
            ORDER BY b.created_at DESC
            """,
            org_id,
        )
    return [dict(r) for r in rows]


async def list_public(
    pool: asyncpg.Pool,
    *,
    search: str | None = None,
    status: str | None = None,
    difficulty: str | None = None,
    tags: list[str] | None = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """
    Return public bounties (status in open/closed) with pagination.
    Returns (rows, total_count).
    """
    conditions = ["b.status IN ('open', 'closed')"]
    params: list[Any] = []
    idx = 1

    # Status filter — ignore 'draft' even if passed
    if status and status in ("open", "closed"):
        conditions.append(f"b.status = ${idx}")
        params.append(status)
        idx += 1

    if difficulty:
        conditions.append(f"b.difficulty = ${idx}")
        params.append(difficulty)
        idx += 1

    if tags:
        conditions.append(f"b.tags && ${idx}::TEXT[]")
        params.append(tags)
        idx += 1

    if search:
        conditions.append(
            f"(b.search_vector @@ plainto_tsquery('english', ${idx}) OR b.title ILIKE '%' || ${idx} || '%')"
        )
        params.append(search)
        idx += 1

    where = " AND ".join(conditions)

    order = "b.created_at DESC"
    if sort == "deadline":
        order = "b.end_date ASC NULLS LAST"

    offset = (page - 1) * page_size

    count_row = await pool.fetchrow(
        f"""
        SELECT count(*) AS total
        FROM bounties b
        JOIN orgs o ON o.id = b.org_id
        WHERE {where}
        """,
        *params,
    )
    total = count_row["total"] if count_row else 0

    rows = await pool.fetch(
        f"""
        SELECT b.id, b.title, o.name AS org_name, b.prize, b.difficulty,
               b.tags, b.status, b.end_date, b.created_at
        FROM bounties b
        JOIN orgs o ON o.id = b.org_id
        WHERE {where}
        ORDER BY {order}
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        page_size,
        offset,
    )
    return [dict(r) for r in rows], total


async def update(
    pool: asyncpg.Pool,
    bounty_id: UUID,
    org_id: UUID,
    data: dict[str, Any],
) -> dict[str, Any] | None:
    """Update mutable bounty fields. Scoped to org to prevent IDOR."""
    if not data:
        return await get_for_org(pool, bounty_id, org_id)

    # Build dynamic SET clause for allowed fields only
    allowed = {
        "title", "description_md", "ideal_output_md", "start_date", "end_date",
        "difficulty", "tags", "skills_required", "submission_formats", "rubric",
        "prize", "resources", "eligibility_notes", "max_submissions_per_user",
    }
    fields = {k: v for k, v in data.items() if k in allowed}

    set_parts = []
    values = [bounty_id, org_id]
    for i, (col, val) in enumerate(fields.items(), start=3):
        if col in ("skills_required", "rubric", "prize", "resources"):
            set_parts.append(f"{col} = ${i}::jsonb")
            values.append(val)
        else:
            set_parts.append(f"{col} = ${i}")
            values.append(val)

    set_parts.append("updated_at = NOW()")
    sql = f"UPDATE bounties SET {', '.join(set_parts)} WHERE id = $1 AND org_id = $2 RETURNING *"
    row = await pool.fetchrow(sql, *values)
    return dict(row) if row else None


async def update_status(
    pool: asyncpg.Pool,
    bounty_id: UUID,
    org_id: UUID,
    new_status: str,
) -> dict[str, Any] | None:
    """Update status only. Scoped to org."""
    row = await pool.fetchrow(
        """
        UPDATE bounties SET status = $3, updated_at = NOW()
        WHERE id = $1 AND org_id = $2
        RETURNING *
        """,
        bounty_id,
        org_id,
        new_status,
    )
    return dict(row) if row else None


async def delete(
    pool: asyncpg.Pool,
    bounty_id: UUID,
    org_id: UUID,
) -> bool:
    """Delete a bounty scoped to org. Returns True if deleted."""
    result = await pool.execute(
        "DELETE FROM bounties WHERE id = $1 AND org_id = $2",
        bounty_id,
        org_id,
    )
    return result != "DELETE 0"
