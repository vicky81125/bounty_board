from uuid import UUID

import asyncpg


async def bounty_leaderboard(
    pool: asyncpg.Pool,
    bounty_id: UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    offset = (page - 1) * page_size
    total = int(
        await pool.fetchval(
            "SELECT count(*) FROM submissions WHERE bounty_id = $1 AND status = 'scored'",
            bounty_id,
        )
        or 0
    )
    rows = await pool.fetch(
        """
        SELECT
            rank() OVER (ORDER BY s.total_score DESC, s.submitted_at ASC) AS rank,
            s.user_id,
            u.display_name,
            u.avatar_url,
            s.total_score,
            s.max_possible_score,
            s.scored_at
        FROM submissions s
        JOIN users u ON u.id = s.user_id
        WHERE s.bounty_id = $1 AND s.status = 'scored'
        ORDER BY s.total_score DESC, s.submitted_at ASC
        LIMIT $2 OFFSET $3
        """,
        bounty_id,
        page_size,
        offset,
    )
    return [dict(r) for r in rows], total


async def global_leaderboard(
    pool: asyncpg.Pool,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    offset = (page - 1) * page_size
    total = int(
        await pool.fetchval("SELECT count(*) FROM users WHERE global_score > 0") or 0
    )
    rows = await pool.fetch(
        """
        SELECT
            rank() OVER (ORDER BY u.global_score DESC) AS rank,
            u.id AS user_id,
            u.display_name,
            u.avatar_url,
            u.global_score,
            (SELECT count(*)
             FROM submissions s
             WHERE s.user_id = u.id AND s.status = 'scored') AS bounties_solved,
            ARRAY(
                SELECT b.difficulty
                FROM submissions s2
                JOIN bounties b ON b.id = s2.bounty_id
                WHERE s2.user_id = u.id AND s2.status = 'scored'
                ORDER BY CASE b.difficulty WHEN 'hard' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
                LIMIT 3
            ) AS top_difficulties
        FROM users u
        WHERE u.global_score > 0
        ORDER BY u.global_score DESC
        LIMIT $1 OFFSET $2
        """,
        page_size,
        offset,
    )
    return [dict(r) for r in rows], total


async def caller_global_rank(pool: asyncpg.Pool, user_id: UUID) -> int | None:
    row = await pool.fetchrow(
        """
        SELECT rank FROM (
            SELECT id, rank() OVER (ORDER BY global_score DESC) AS rank
            FROM users WHERE global_score > 0
        ) t WHERE id = $1
        """,
        user_id,
    )
    return int(row["rank"]) if row else None
