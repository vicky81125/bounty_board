from __future__ import annotations

import secrets
from datetime import datetime, UTC, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import Request, Response

from app.config import Settings
from app.database.repositories import sessions as sessions_repo
from app.models.session import Session
from app.security.csrf import create_signed_token


async def create_session(
    pool: asyncpg.Pool,
    settings: Settings,
    user_id: UUID,
    request: Request,
) -> Session:
    """Create a new DB-backed session with a 256-bit opaque token."""
    now = datetime.now(UTC)
    session_id = secrets.token_urlsafe(32)
    expires_at = now + timedelta(days=settings.session_duration_days)

    session = await sessions_repo.create(
        pool,
        session_id=session_id,
        user_id=user_id,
        created_at=now,
        last_activity=now,
        expires_at=expires_at,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        is_revoked=False,
    )
    return session


async def validate_session(
    pool: asyncpg.Pool,
    settings: Settings,
    request: Request,
) -> Session | None:
    """Look up session from cookie. Returns None if missing / expired / revoked."""
    session_id = request.cookies.get(settings.session_cookie_name)
    if not session_id:
        return None
    return await sessions_repo.get_by_session_id(pool, session_id)


async def maybe_refresh_session(
    pool: asyncpg.Pool,
    settings: Settings,
    session: Session,
) -> None:
    """Extend expires_at if last_activity is stale (throttled to once per 60s)."""
    now = datetime.now(UTC)
    delta = (now - session.last_activity).total_seconds()
    if delta < settings.session_activity_update_interval_seconds:
        return
    await sessions_repo.update_activity(pool, session.session_id, now, settings.session_duration_days)


def set_session_cookies(response: Response, session: Session, settings: Settings) -> None:
    """Set the HTTP-only session cookie and the JS-readable CSRF cookie."""
    max_age = int((session.expires_at - datetime.now(UTC)).total_seconds())

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session.session_id,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.session_samesite,
        domain=settings.session_domain,
        path="/",
    )

    csrf_token = create_signed_token(session.session_id, settings.secret_key)
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        max_age=max_age,
        httponly=False,  # JS must be able to read this to set X-CSRF-Token header
        secure=settings.cookie_secure,
        samesite=settings.session_samesite,
        domain=settings.session_domain,
        path="/",
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/", domain=settings.session_domain)
    response.delete_cookie(key=settings.csrf_cookie_name, path="/", domain=settings.session_domain)
