import re
import uuid
from datetime import datetime, timezone

import asyncpg
from fastapi import HTTPException

from app.database.repositories import submissions as submissions_repo
from app.services.storage_service import STORAGE_PATH_RE

# GitHub: must be github.com/owner/repo — no bare domain, no path injection
GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/[A-Za-z0-9]([A-Za-z0-9_-]{0,38}[A-Za-z0-9])?/"
    r"[A-Za-z0-9][A-Za-z0-9._-]{0,98}[A-Za-z0-9]$"
)

# Drive: must be a known Drive URL format with a non-empty ID
DRIVE_URL_PATTERN = re.compile(
    r"^https://drive\.google\.com/"
    r"(file/d/[A-Za-z0-9_-]+(/[^?#]*)?|"
    r"drive/folders/[A-Za-z0-9_-]+(/[^?#]*)?|"
    r"open\?id=[A-Za-z0-9_-]+)$"
)

# Valid forward-only status transitions
VALID_TRANSITIONS = {
    "pending": {"under_review", "rejected"},
    "under_review": {"rejected", "scored"},
}


def validate_submission_url(submission_type: str, url: str | None) -> None:
    if submission_type == "github_url":
        if not url or not GITHUB_URL_PATTERN.fullmatch(url):
            raise HTTPException(
                400,
                "Must be a valid public GitHub repository URL (github.com/owner/repo)",
            )
    elif submission_type == "drive_url":
        if not url or not DRIVE_URL_PATTERN.fullmatch(url):
            raise HTTPException(400, "Must be a valid Google Drive URL")


def validate_status_transition(current: str, next_status: str) -> None:
    allowed = VALID_TRANSITIONS.get(current, set())
    if next_status not in allowed:
        raise HTTPException(
            400,
            f"Cannot transition submission from '{current}' to '{next_status}'",
        )


def generate_upload_path(bounty_id, user_id) -> tuple[str, uuid.UUID]:
    """Generate storage path and submission ID for a new upload_pending row."""
    sub_id = uuid.uuid4()
    path = f"{bounty_id}/{user_id}/{sub_id}.zip"
    return path, sub_id


async def check_submission_limit(pool, bounty_id, user_id, bounty: dict) -> None:
    """Raise 409 if the user has reached max_submissions_per_user (counting non-rejected only)."""
    max_per_user = bounty.get("max_submissions_per_user")
    if max_per_user is None:
        return
    count = await submissions_repo.count_for_user(pool, bounty_id, user_id)
    if count >= max_per_user:
        raise HTTPException(409, f"Submission limit reached ({max_per_user})")


async def resolve_upload_token(
    pool: asyncpg.Pool,
    upload_token,
    user_id,
    bounty_id,
) -> str:
    """Resolve an upload_token UUID → file_path. Verifies ownership, TTL, and path format."""
    if not upload_token:
        raise HTTPException(400, "upload_token required for zip submissions")
    row = await submissions_repo.get_pending(pool, upload_token)
    if not row:
        raise HTTPException(404, "Upload token not found or already used")
    if row["user_id"] != user_id or row["bounty_id"] != bounty_id:
        raise HTTPException(403, "Invalid upload token")
    expires_at = row["upload_token_expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(409, "Upload token expired — please re-upload the file")
    if not STORAGE_PATH_RE.match(row["file_path"]):
        raise HTTPException(500, "Malformed storage path")
    return row["file_path"]
