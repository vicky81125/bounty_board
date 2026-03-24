"""CSRF protection using double-submit cookie pattern with HMAC signing."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

if TYPE_CHECKING:
    from fastapi import Request


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def create_signed_token(session_id: str, secret: str) -> str:
    """Create HMAC-signed CSRF token tied to the session ID."""
    token = generate_csrf_token()
    signature = hmac.new(
        secret.encode(),
        f"{token}:{session_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{token}:{signature}"


def verify_token(token: str, session_id: str, secret: str) -> bool:
    """Verify that a CSRF token signature is valid for the given session."""
    try:
        token_value, signature = token.split(":", 1)
        expected = hmac.new(
            secret.encode(),
            f"{token_value}:{session_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, expected)
    except (ValueError, AttributeError):
        return False


async def verify_csrf_token(
    request: Request,
    csrf_enabled: bool,
    csrf_header_name: str,
    csrf_cookie_name: str,
    session_cookie_name: str,
    secret_key: str,
) -> None:
    """Verify CSRF token for state-changing requests (POST/PUT/PATCH/DELETE)."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    if not csrf_enabled:
        return

    csrf_header = request.headers.get(csrf_header_name)
    if not csrf_header:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CSRF token missing from header")

    csrf_cookie = request.cookies.get(csrf_cookie_name)
    if not csrf_cookie:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CSRF cookie missing")

    session_id = request.cookies.get(session_cookie_name)
    if not session_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if not verify_token(csrf_cookie, session_id, secret_key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token signature")

    if not hmac.compare_digest(csrf_header, csrf_cookie):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CSRF token mismatch")
