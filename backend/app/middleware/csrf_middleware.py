"""CSRF middleware — pure ASGI, zero response buffering (safe for streaming)."""

from __future__ import annotations

import json

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import get_settings
from app.security.csrf import verify_csrf_token

# Paths exempt from CSRF — login/register have no session yet
CSRF_EXEMPT_PATHS = {
    "/api/identity/register",
    "/api/identity/login",
    "/api/health",
}


class CSRFMiddleware:
    """Pure ASGI CSRF middleware. GET/HEAD/OPTIONS are always exempt."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")

        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        if path in CSRF_EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        settings = get_settings()

        try:
            await verify_csrf_token(
                request=request,
                csrf_enabled=settings.csrf_enabled,
                csrf_header_name=settings.csrf_token_header,
                csrf_cookie_name=settings.csrf_cookie_name,
                session_cookie_name=settings.session_cookie_name,
                secret_key=settings.secret_key,
            )
        except Exception as exc:
            status_code = getattr(exc, "status_code", 500)
            detail = getattr(exc, "detail", str(exc))
            body = json.dumps({"detail": detail}).encode()
            await send({
                "type": "http.response.start",
                "status": status_code,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(body)).encode()],
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
