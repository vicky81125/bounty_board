"""Auth middleware: validates session cookie and injects claims into request.state."""

from __future__ import annotations

from fastapi import Request

from app.config import get_settings
from app.models.user import UserClaims
from app.services import session_service


async def authenticate_request(request: Request) -> None:
    """
    Try to validate the session cookie. If valid, set:
      - request.state.session  (Session model)
      - request.state.user     (UserClaims)
    If no valid cookie, both are set to None.
    Routes that require auth use Depends(get_current_user) — this middleware
    only pre-populates state so the dependency can avoid a redundant DB call.
    """
    settings = get_settings()
    pool = getattr(request.app.state, "db", None)

    request.state.session = None
    request.state.user = None

    if pool is None:
        return

    session = await session_service.validate_session(pool, settings, request)
    if not session:
        return

    request.state.session = session
    request.state.user = UserClaims(
        user_id=session.user_id,
        # account_type and is_active filled by get_current_user on first DB fetch
        account_type="participant",  # placeholder; dependencies.py resolves from DB
        is_active=True,
    )

    # Slide the session expiry window (throttled)
    await session_service.maybe_refresh_session(pool, settings, session)
