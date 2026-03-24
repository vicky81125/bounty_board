from __future__ import annotations

import re
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from app.database.repositories import orgs as orgs_repo
from app.database.repositories import users as users_repo
from app.dependencies import (
    get_current_user,
    get_pool,
    require_org_admin,
    require_org_member,
)
from app.models.user import User

router = APIRouter(prefix="/orgs", tags=["orgs"])


# ── Request / Response models ──────────────────────────────────────────────


class OrgCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    slug: str = Field(..., pattern=r"^[a-z0-9-]{3,40}$")


class OrgResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    created_by: UUID
    created_at: Any


class OrgMemberInviteRequest(BaseModel):
    email: EmailStr
    role: Literal["admin", "moderator"]


class MemberRoleUpdateRequest(BaseModel):
    role: Literal["admin", "moderator"]


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgCreateRequest,
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    if user.account_type != "organizer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organizer account required")

    if await orgs_repo.slug_exists(pool, body.slug):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Slug already taken")

    org = await orgs_repo.create(
        pool,
        name=body.name,
        slug=body.slug,
        created_by=user.id,
    )
    return org


# NOTE: /mine must be registered BEFORE /{org_id} to avoid "mine" being matched as a UUID
@router.get("/mine")
async def list_my_orgs(
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    if user.account_type != "organizer":
        return []
    return await orgs_repo.list_for_user(pool, user.id)


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org(
    org_id: UUID,
    user: User = Depends(require_org_member),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    org = await orgs_repo.get_by_id(pool, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Org not found")
    return org


@router.get("/{org_id}/members/me")
async def get_my_membership(
    org_id: UUID,
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Return the current user's membership for this org. 404 if not a member.
    Used by the org layout to get the user's role without fetching all members."""
    membership = await orgs_repo.get_membership(pool, org_id, user.id)
    if not membership:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not a member of this org")
    return dict(membership)


@router.get("/{org_id}/members")
async def list_members(
    org_id: UUID,
    user: User = Depends(require_org_member),
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    return await orgs_repo.list_members(pool, org_id)


@router.post("/{org_id}/members", status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: UUID,
    body: OrgMemberInviteRequest,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    invitee = await users_repo.get_by_email(pool, str(body.email))
    if not invitee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No user with that email")

    if invitee["account_type"] != "organizer":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only organizer accounts can be org members",
        )

    existing = await orgs_repo.get_membership(pool, org_id, invitee["id"])
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="User is already a member")

    member = await orgs_repo.add_member(
        pool, org_id=org_id, user_id=invitee["id"], role=body.role
    )
    return member


@router.patch("/{org_id}/members/{user_id}")
async def update_member_role(
    org_id: UUID,
    user_id: UUID,
    body: MemberRoleUpdateRequest,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    target = await orgs_repo.get_membership(pool, org_id, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Last-admin guard: cannot demote the last admin
    if target["role"] == "admin" and body.role != "admin":
        admin_count = await orgs_repo.count_admins(pool, org_id)
        if admin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last org admin",
            )

    updated = await orgs_repo.update_member_role(
        pool, org_id=org_id, user_id=user_id, role=body.role
    )
    return updated


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(
    org_id: UUID,
    user_id: UUID,
    user: User = Depends(require_org_admin),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    target = await orgs_repo.get_membership(pool, org_id, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Last-admin guard: cannot remove the last admin
    if target["role"] == "admin":
        admin_count = await orgs_repo.count_admins(pool, org_id)
        if admin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last org admin",
            )

    await orgs_repo.remove_member(pool, org_id=org_id, user_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
