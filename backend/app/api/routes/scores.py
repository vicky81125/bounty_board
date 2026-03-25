from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.repositories import leaderboard as leaderboard_repo
from app.database.repositories import scores as scores_repo
from app.dependencies import (
    get_current_user,
    get_pool,
    require_org_admin,
    require_org_admin_or_moderator,
)
from app.models.user import User
from app.services.scoring_service import ScoreRequest, save_score

# ── Routers ───────────────────────────────────────────────────────────────────

org_router = APIRouter(tags=["scores"])
public_router = APIRouter(tags=["leaderboard"])


# ── Scoring endpoints (org-scoped) ────────────────────────────────────────────


@org_router.post(
    "/orgs/{org_id}/submissions/{sub_id}/score",
    status_code=201,
)
async def score_submission(
    org_id: UUID,
    sub_id: UUID,
    payload: ScoreRequest,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    """Score a submission. Submission must be in 'under_review' status."""
    return await save_score(pool, sub_id, org_id, user.id, payload)


@org_router.patch(
    "/orgs/{org_id}/submissions/{sub_id}/score",
)
async def override_score(
    org_id: UUID,
    sub_id: UUID,
    payload: ScoreRequest,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    """Admin override: re-score an already-scored submission."""
    return await save_score(pool, sub_id, org_id, user.id, payload, allow_override=True)


@org_router.get("/orgs/{org_id}/submissions/{sub_id}/score")
async def get_score(
    org_id: UUID,
    sub_id: UUID,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    """Get existing score details for a submission."""
    score = await scores_repo.get_by_submission(pool, sub_id)
    if not score:
        raise HTTPException(404, "No score found for this submission")
    return score


# ── Leaderboard endpoints (any authenticated user) ────────────────────────────


@public_router.get("/bounties/{bounty_id}/leaderboard")
async def get_bounty_leaderboard(
    bounty_id: UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    entries, total = await leaderboard_repo.bounty_leaderboard(pool, bounty_id, page, page_size)

    # Convert Decimal/int fields and add score_percentage
    result = []
    for e in entries:
        entry = dict(e)
        entry["rank"] = int(entry["rank"])
        entry["user_id"] = str(entry["user_id"])
        entry["total_score"] = int(entry["total_score"] or 0)
        entry["max_possible_score"] = int(entry["max_possible_score"] or 0)
        entry["score_percentage"] = (
            round(entry["total_score"] / entry["max_possible_score"] * 100, 1)
            if entry["max_possible_score"]
            else 0.0
        )
        entry["is_caller"] = entry["user_id"] == str(user.id)
        if entry["scored_at"]:
            entry["scored_at"] = entry["scored_at"].isoformat()
        result.append(entry)

    return {
        "entries": result,
        "total": total,
        "page": page,
        "page_size": page_size,
        "bounty_max_score": result[0]["max_possible_score"] if result else 0,
    }


@public_router.get("/leaderboard/global")
async def get_global_leaderboard(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    entries, total = await leaderboard_repo.global_leaderboard(pool, page, page_size)
    caller_rank = await leaderboard_repo.caller_global_rank(pool, user.id)

    result = []
    for e in entries:
        entry = dict(e)
        entry["rank"] = int(entry["rank"])
        entry["user_id"] = str(entry["user_id"])
        entry["global_score"] = float(entry["global_score"])
        entry["bounties_solved"] = int(entry["bounties_solved"] or 0)
        entry["top_difficulties"] = list(entry.get("top_difficulties") or [])
        entry["is_caller"] = entry["user_id"] == str(user.id)
        result.append(entry)

    return {
        "entries": result,
        "total": total,
        "page": page,
        "page_size": page_size,
        "caller_rank": caller_rank,
    }
