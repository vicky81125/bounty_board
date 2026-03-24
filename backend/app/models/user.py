from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, HttpUrl


class User(BaseModel):
    id: UUID
    email: str
    username: str
    display_name: str
    account_type: Literal["organizer", "participant"]
    password_hash: str
    avatar_url: str | None = None
    bio: str | None = None
    location: str | None = None
    skills: list[str] | None = None
    website_url: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    email_verified: bool = False
    is_active: bool = True
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserPublic(BaseModel):
    """Safe user representation — never includes password_hash."""
    id: UUID
    email: str
    username: str
    display_name: str
    account_type: Literal["organizer", "participant"]
    avatar_url: str | None = None


class UserClaims(BaseModel):
    """Lightweight claims injected into request.state.user by auth middleware."""
    user_id: UUID
    account_type: Literal["organizer", "participant"]
    is_active: bool
