from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, HttpUrl

from app.database.repositories import bounties as bounties_repo
from app.dependencies import (
    get_current_user,
    get_pool,
    require_org_admin,
    require_org_admin_or_moderator,
    require_org_member,
)
from app.models.user import User
from app.services.bounty_service import validate_bounty

router = APIRouter(tags=["bounties"])


# ── Request / Response models ──────────────────────────────────────────────


class RubricCriterion(BaseModel):
    criterion: str = Field(..., min_length=1)
    max_points: int = Field(..., ge=1)


class ResourceLink(BaseModel):
    label: str = Field(..., min_length=1)
    url: HttpUrl


class PrizeSingle(BaseModel):
    type: Literal["single"] = "single"
    amount: float = Field(..., ge=0)
    currency: str = Field(..., min_length=1, max_length=10)
    label: str


class BountyCreateRequest(BaseModel):
    # org_id and created_by are set server-side — never accepted from client
    title: str = Field(..., min_length=3, max_length=120)
    description_md: str = ""
    ideal_output_md: str = ""
    start_date: datetime | None = None
    end_date: datetime | None = None
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    tags: list[str] = Field(default_factory=list)
    skills_required: list[str] = Field(default_factory=list)
    submission_formats: list[Literal["zip", "github_url", "drive_url"]] = Field(
        ..., min_length=1
    )
    rubric: list[RubricCriterion] = Field(..., min_length=1)
    status: Literal["draft", "open"] = "draft"
    prize: PrizeSingle | None = None
    resources: list[ResourceLink] = Field(default_factory=list)
    eligibility_notes: str | None = None
    max_submissions_per_user: int | None = Field(default=None, ge=1)


class BountyStatusUpdateRequest(BaseModel):
    status: Literal["open", "closed"]


class BountyCard(BaseModel):
    id: UUID
    title: str
    org_name: str
    prize_summary: str | None
    difficulty: str
    tags: list[str]
    status: str
    end_date: datetime | None
    submission_count: int | None = None
    created_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────


def _prize_summary(prize: Any) -> str | None:
    if not prize:
        return None
    if isinstance(prize, str):
        try:
            prize = json.loads(prize)
        except Exception:
            return None
    if isinstance(prize, dict) and prize.get("type") == "single":
        return f"{prize.get('amount', '')} {prize.get('currency', '')}".strip()
    return None


def _row_to_card(row: dict) -> BountyCard:
    return BountyCard(
        id=row["id"],
        title=row["title"],
        org_name=row["org_name"],
        prize_summary=_prize_summary(row.get("prize")),
        difficulty=row["difficulty"],
        tags=(row["tags"] or [])[:3],
        status=row["status"],
        end_date=row.get("end_date"),
        submission_count=None,
        created_at=row["created_at"],
    )


def _payload_to_dict(payload: BountyCreateRequest) -> dict:
    d = payload.model_dump()
    # Serialize nested Pydantic models to plain dicts for the repo layer
    d["rubric"] = [c.model_dump() for c in payload.rubric]
    d["resources"] = [{"label": r.label, "url": str(r.url)} for r in payload.resources]
    d["prize"] = payload.prize.model_dump() if payload.prize else None
    return d


# ── Public endpoints ───────────────────────────────────────────────────────


@router.get("/bounties", response_model=dict)
async def list_bounties(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    sort: str = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    rows, total = await bounties_repo.list_public(
        pool,
        search=search,
        status=status,
        difficulty=difficulty,
        tags=tag_list,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [_row_to_card(r).model_dump() for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/bounties/{bounty_id}")
async def get_bounty(
    bounty_id: UUID,
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    bounty = await bounties_repo.get_by_id(pool, bounty_id)
    if not bounty or bounty["status"] == "draft":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bounty not found")
    return bounty


# ── Org-scoped endpoints ───────────────────────────────────────────────────


@router.get("/orgs/{org_id}/bounties")
async def list_org_bounties(
    org_id: UUID,
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(require_org_member),
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    return await bounties_repo.list_org_bounties(pool, org_id, status=status_filter)


@router.post("/orgs/{org_id}/bounties", status_code=status.HTTP_201_CREATED)
async def create_bounty(
    org_id: UUID,
    payload: BountyCreateRequest,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    data = _payload_to_dict(payload)
    try:
        validate_bounty(data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    return await bounties_repo.create(pool, org_id=org_id, created_by=user.id, data=data)


@router.patch("/orgs/{org_id}/bounties/{bounty_id}")
async def update_bounty(
    org_id: UUID,
    bounty_id: UUID,
    payload: BountyCreateRequest,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    existing = await bounties_repo.get_for_org(pool, bounty_id, org_id)
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bounty not found")

    data = _payload_to_dict(payload)
    try:
        validate_bounty(data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    updated = await bounties_repo.update(pool, bounty_id, org_id, data)
    if not updated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bounty not found")
    return updated


@router.patch("/orgs/{org_id}/bounties/{bounty_id}/status")
async def change_bounty_status(
    org_id: UUID,
    bounty_id: UUID,
    payload: BountyStatusUpdateRequest,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    existing = await bounties_repo.get_for_org(pool, bounty_id, org_id)
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bounty not found")

    if existing["status"] == "closed":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Closed bounties cannot be reopened",
        )

    updated = await bounties_repo.update_status(pool, bounty_id, org_id, payload.status)
    return updated


@router.delete("/orgs/{org_id}/bounties/{bounty_id}")
async def delete_bounty(
    org_id: UUID,
    bounty_id: UUID,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    existing = await bounties_repo.get_for_org(pool, bounty_id, org_id)
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bounty not found")

    if existing["status"] != "draft":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only draft bounties can be deleted",
        )

    await bounties_repo.delete(pool, bounty_id, org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
