from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import HTTPException
from pydantic import BaseModel

from app.database.repositories import bounties as bounties_repo
from app.database.repositories import scores as scores_repo
from app.database.repositories import submissions as submissions_repo


# ── Request model ─────────────────────────────────────────────────────────────


class CriterionScore(BaseModel):
    criterion: str
    score: int


class ScoreRequest(BaseModel):
    criteria_scores: list[CriterionScore]
    notes: str | None = None


# ── Service functions ─────────────────────────────────────────────────────────


async def save_score(
    pool: asyncpg.Pool,
    sub_id: UUID,
    org_id: UUID,
    scored_by: UUID,
    payload: ScoreRequest,
    *,
    allow_override: bool = False,
) -> dict:
    """
    Validate rubric, upsert score row, mark submission scored, recompute global_score.
    Set allow_override=True (admin PATCH) to score already-scored submissions.
    """
    from app.database.repositories import submissions as submissions_repo
    from app.database.repositories.submissions import get_for_org

    sub = await get_for_org(pool, sub_id, org_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    if allow_override:
        if sub["status"] not in ("under_review", "scored"):
            raise HTTPException(409, "Submission must be 'under_review' or 'scored' to override score")
    else:
        if sub["status"] != "under_review":
            raise HTTPException(409, "Submission must be 'under_review' before scoring")

    bounty = await bounties_repo.get_by_id(pool, sub["bounty_id"])
    if not bounty:
        raise HTTPException(404, "Bounty not found")

    rubric = bounty.get("rubric") or []
    if not rubric:
        raise HTTPException(400, "Bounty has no rubric — cannot score")

    rubric_map: dict[str, int] = {c["criterion"]: c["max_points"] for c in rubric}
    submitted_keys = {item.criterion for item in payload.criteria_scores}

    # All rubric criteria must be scored
    missing = set(rubric_map.keys()) - submitted_keys
    if missing:
        raise HTTPException(400, f"Missing scores for criteria: {', '.join(sorted(missing))}")

    # Validate each score is within bounds
    total = 0
    validated: list[dict] = []
    for item in payload.criteria_scores:
        if item.criterion not in rubric_map:
            raise HTTPException(400, f"Unknown criterion: {item.criterion!r}")
        max_pts = rubric_map[item.criterion]
        if not (0 <= item.score <= max_pts):
            raise HTTPException(400, f"Score for '{item.criterion}' must be 0–{max_pts}")
        total += item.score
        validated.append({"criterion": item.criterion, "max_points": max_pts, "score": item.score})

    max_total = sum(rubric_map.values())

    async with pool.acquire() as conn:
        async with conn.transaction():
            await scores_repo.upsert(conn, sub_id, {
                "scored_by": scored_by,
                "criteria_scores": validated,
                "total_score": total,
                "max_possible_score": max_total,
                "notes": payload.notes,
            })
            await submissions_repo.mark_scored(conn, sub_id, total, max_total)
            await _recompute_global_score(conn, sub["user_id"])

    return {"total_score": total, "max_possible_score": max_total}


async def _recompute_global_score(conn: asyncpg.Connection, user_id: UUID) -> None:
    """Recompute and persist global_score for a user. Runs inside the same transaction."""
    rows = await conn.fetch(
        """
        SELECT s.total_score, s.max_possible_score, b.difficulty, b.prize
        FROM submissions s
        JOIN bounties b ON b.id = s.bounty_id
        WHERE s.user_id = $1 AND s.status = 'scored'
        """,
        user_id,
    )

    score = 0.0
    for row in rows:
        if not row["max_possible_score"]:
            continue
        pct = row["total_score"] / row["max_possible_score"]
        mult = {"easy": 1.0, "medium": 1.5, "hard": 2.5}.get(row["difficulty"], 1.0)
        prize_val = _prize_usd_value(row["prize"])
        score += pct * mult * prize_val

    await conn.execute(
        "UPDATE users SET global_score = $1 WHERE id = $2",
        score,
        user_id,
    )


def _prize_usd_value(prize: dict | None) -> float:
    if not prize:
        return 100.0
    if prize.get("type") == "single":
        return float(prize.get("amount", 100))
    if prize.get("type") == "tiered":
        return sum(float(t.get("amount", 0)) for t in prize.get("tiers", []))
    return 100.0
