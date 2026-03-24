from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Session(BaseModel):
    session_id: str
    user_id: UUID
    created_at: datetime
    last_activity: datetime
    expires_at: datetime
    ip_address: str | None = None
    user_agent: str | None = None
    is_revoked: bool = False
