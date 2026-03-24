from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import Depends, HTTPException, Request, status

from app.database.repositories import users as users_repo
from app.database.repositories import orgs as orgs_repo
from app.models.user import User


async def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db


async def get_current_user(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
) -> User:
    session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    row = await users_repo.get_by_id(pool, session.user_id)
    if not row or not row["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return User(**row)


def require_organizer(user: User = Depends(get_current_user)) -> User:
    if user.account_type != "organizer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organizer account required")
    return user


async def require_org_admin(
    org_id: UUID,
    user: User = Depends(require_organizer),
    pool: asyncpg.Pool = Depends(get_pool),
) -> User:
    membership = await orgs_repo.get_membership(pool, org_id, user.id)
    if not membership or membership["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Org admin access required")
    return user


async def require_org_member(
    org_id: UUID,
    user: User = Depends(require_organizer),
    pool: asyncpg.Pool = Depends(get_pool),
) -> User:
    """Any org member (admin or moderator). Used for read-only org-scoped endpoints."""
    membership = await orgs_repo.get_membership(pool, org_id, user.id)
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Org membership required")
    return user


async def require_org_admin_or_moderator(
    org_id: UUID,
    user: User = Depends(require_organizer),
    pool: asyncpg.Pool = Depends(get_pool),
) -> User:
    """Admin or moderator. Used for bounty edit endpoints."""
    membership = await orgs_repo.get_membership(pool, org_id, user.id)
    if not membership or membership["role"] not in ("admin", "moderator"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Org admin or moderator required"
        )
    return user
