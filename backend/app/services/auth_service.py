from __future__ import annotations

import secrets
from datetime import datetime, UTC
from typing import Any
from uuid import uuid4

import asyncpg
import bcrypt
from fastapi import HTTPException, status

from app.database.repositories import users as users_repo


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


async def register(pool: asyncpg.Pool, **fields: Any) -> dict[str, Any]:
    """Create a new user account. Raises 409 on duplicate email or username."""
    email = fields["email"].lower()
    username = fields["username"].lower()

    existing_email = await users_repo.get_by_email(pool, email)
    if existing_email:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "email_taken", "message": "Email already registered"},
        )

    existing_username = await users_repo.get_by_username(pool, username)
    if existing_username:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "username_taken", "message": "Username already taken"},
        )

    now = datetime.now(UTC)
    user = await users_repo.create(
        pool,
        id=uuid4(),
        email=email,
        username=username,
        display_name=fields["display_name"],
        password_hash=hash_password(fields["password"]),
        account_type=fields["account_type"],
        bio=fields.get("bio"),
        location=fields.get("location"),
        skills=fields.get("skills"),
        website_url=str(fields["website_url"]) if fields.get("website_url") else None,
        github_url=str(fields["github_url"]) if fields.get("github_url") else None,
        linkedin_url=str(fields["linkedin_url"]) if fields.get("linkedin_url") else None,
        twitter_url=str(fields["twitter_url"]) if fields.get("twitter_url") else None,
        email_verified=False,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    return user


async def authenticate(pool: asyncpg.Pool, email: str, password: str) -> dict[str, Any]:
    """Verify credentials. Raises 401 on failure."""
    user = await users_repo.get_by_email(pool, email.lower())
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Account suspended")
    return user
