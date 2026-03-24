from datetime import datetime, UTC
from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database.repositories import sessions as sessions_repo
from app.database.repositories import users as users_repo
from app.dependencies import get_current_user, get_pool
from app.models.user import User, UserPublic
from app.services import auth_service, session_service
from app.config import get_settings

router = APIRouter(prefix="/identity", tags=["identity"])
limiter = Limiter(key_func=get_remote_address)


# ── Request / Response models ──────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(min_length=1, max_length=80)
    account_type: str = Field(pattern=r"^(organizer|participant)$")
    bio: str | None = Field(None, max_length=500)
    location: str | None = Field(None, max_length=100)
    skills: list[str] | None = None
    website_url: HttpUrl | None = None
    github_url: HttpUrl | None = None
    linkedin_url: HttpUrl | None = None
    twitter_url: HttpUrl | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SessionResponse(BaseModel):
    user: UserPublic
    session_expires_at: datetime


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest = Body(...),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    settings = get_settings()
    user_row = await auth_service.register(pool, **body.model_dump())
    session = await session_service.create_session(pool, settings, user_row["id"], request)
    session_service.set_session_cookies(response, session, settings)
    return SessionResponse(user=UserPublic(**user_row), session_expires_at=session.expires_at)


@router.post("/login", response_model=SessionResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest = Body(...),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    settings = get_settings()
    user_row = await auth_service.authenticate(pool, body.email, body.password)

    # Revoke all prior sessions (prevents session fixation)
    await sessions_repo.revoke_all_for_user(pool, user_row["id"])

    session = await session_service.create_session(pool, settings, user_row["id"], request)
    session_service.set_session_cookies(response, session, settings)
    return SessionResponse(user=UserPublic(**user_row), session_expires_at=session.expires_at)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    settings = get_settings()
    session = request.state.session
    await sessions_repo.revoke(pool, session.session_id)
    session_service.clear_session_cookies(response, settings)
    return {}


@router.get("/session", response_model=SessionResponse)
async def get_session(
    request: Request,
    user: User = Depends(get_current_user),
) -> Any:
    session = request.state.session
    return SessionResponse(user=UserPublic(**user.model_dump()), session_expires_at=session.expires_at)


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> Any:
    return UserPublic(**user.model_dump())


@router.get("/check-username")
@limiter.limit("30/minute")
async def check_username(
    request: Request,  # must be first for slowapi
    username: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, bool]:
    exists = await users_repo.username_exists(pool, username.lower())
    return {"available": not exists}
