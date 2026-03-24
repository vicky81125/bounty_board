from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database.repositories import bounties as bounties_repo
from app.database.repositories import submissions as submissions_repo
from app.dependencies import (
    get_current_user,
    get_pool,
    require_org_admin_or_moderator,
    require_participant,
)
from app.models.user import User
from app.services import storage_service as storage_svc
from app.services import submission_service
from app.services.storage_service import StorageService, get_storage_service

limiter = Limiter(key_func=get_remote_address)

# ── Participant router ────────────────────────────────────────────────────────
# Prefix: /bounties/{bounty_id}/submissions
participant_router = APIRouter(tags=["submissions"])

# ── Org router ────────────────────────────────────────────────────────────────
# Prefix: /orgs/{org_id}
org_router = APIRouter(tags=["org-submissions"])


# ── Request / Response models ─────────────────────────────────────────────────


class UploadUrlResponse(BaseModel):
    signed_url: str
    upload_token: UUID
    upload_url_expires_at: datetime


class SubmissionCreateRequest(BaseModel):
    submission_type: Literal["zip", "github_url", "drive_url"]
    upload_token: UUID | None = None
    external_url: str | None = None
    description: str = Field(min_length=10, max_length=5000)


class SubmissionUpdateRequest(BaseModel):
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    external_url: str | None = None
    upload_token: UUID | None = None          # new zip file for replacement
    new_submission_type: Literal["zip", "github_url", "drive_url"] | None = None


class StatusUpdateRequest(BaseModel):
    status: Literal["under_review", "rejected", "scored"]
    review_notes: str | None = None


# ── Participant endpoints ─────────────────────────────────────────────────────

# IMPORTANT: /upload-url and /mine are registered BEFORE /{sub_id} to avoid
# FastAPI matching literal segments as UUIDs.


@participant_router.post(
    "/bounties/{bounty_id}/submissions/upload-url",
    response_model=UploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def get_upload_url(
    request: Request,
    bounty_id: UUID,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
    storage: StorageService = Depends(get_storage_service),
) -> Any:
    bounty = await bounties_repo.get_by_id(pool, bounty_id)
    if not bounty or bounty["status"] != "open":
        raise HTTPException(409, "Bounty is not open")
    if "zip" not in bounty["submission_formats"]:
        raise HTTPException(400, "This bounty does not accept zip submissions")
    await submission_service.check_submission_limit(pool, bounty_id, user.id, bounty)

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    path, sub_id = submission_service.generate_upload_path(bounty_id, user.id)
    await submissions_repo.create_pending(pool, sub_id, bounty_id, user.id, path, expires_at)

    signed = await storage.create_signed_upload_url(path)
    return UploadUrlResponse(
        signed_url=signed.signed_url,
        upload_token=sub_id,
        upload_url_expires_at=expires_at,
    )


@participant_router.get("/bounties/{bounty_id}/submissions/mine/download-url")
async def get_my_submission_download_url(
    bounty_id: UUID,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    sub = await submissions_repo.get_mine(pool, bounty_id, user.id)
    if not sub:
        raise HTTPException(404, "No submission found")
    if not sub.get("file_path"):
        raise HTTPException(400, "Submission has no file")
    signed_url = await storage.create_signed_download_url(sub["file_path"])
    return {"download_url": signed_url}


@participant_router.get("/bounties/{bounty_id}/submissions/mine")
async def get_my_submission(
    bounty_id: UUID,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    sub = await submissions_repo.get_mine(pool, bounty_id, user.id)
    if not sub:
        raise HTTPException(404, "No submission found")
    return sub


@participant_router.post(
    "/bounties/{bounty_id}/submissions",
    status_code=status.HTTP_201_CREATED,
)
async def create_submission(
    bounty_id: UUID,
    payload: SubmissionCreateRequest,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    bounty = await bounties_repo.get_by_id(pool, bounty_id)
    if not bounty or bounty["status"] != "open":
        raise HTTPException(409, "Bounty is not open")
    if payload.submission_type not in bounty["submission_formats"]:
        raise HTTPException(400, f"Bounty does not accept {payload.submission_type} submissions")

    if payload.submission_type in ("github_url", "drive_url"):
        submission_service.validate_submission_url(payload.submission_type, payload.external_url)

    file_path = None
    if payload.submission_type == "zip":
        file_path = await submission_service.resolve_upload_token(
            pool, payload.upload_token, user.id, bounty_id
        )

    try:
        return await submissions_repo.create(
            pool,
            bounty_id=bounty_id,
            user_id=user.id,
            submission_type=payload.submission_type,
            file_path=file_path,
            external_url=payload.external_url,
            description=payload.description,
            upload_token=payload.upload_token,
            max_per_user=bounty["max_submissions_per_user"],
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "You already have an active submission for this bounty")


@participant_router.post(
    "/bounties/{bounty_id}/submissions/{sub_id}/replace-url",
    response_model=UploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
)
async def get_replace_url(
    bounty_id: UUID,
    sub_id: UUID,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
    storage: StorageService = Depends(get_storage_service),
) -> Any:
    """Get a signed upload URL for replacing or switching to a zip submission."""
    sub = await submissions_repo.get_by_id_and_bounty(pool, sub_id, bounty_id)
    if not sub or sub["user_id"] != user.id:
        raise HTTPException(404, "Submission not found")
    if sub["status"] != "pending":
        raise HTTPException(409, "Can only replace file for pending submissions")
    bounty = await bounties_repo.get_by_id(pool, bounty_id)
    if not bounty or "zip" not in bounty["submission_formats"]:
        raise HTTPException(400, "This bounty does not accept zip submissions")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    path, token_sub_id = submission_service.generate_upload_path(bounty_id, user.id)
    await submissions_repo.create_pending(pool, token_sub_id, bounty_id, user.id, path, expires_at)
    signed = await storage.create_signed_upload_url(path)
    return UploadUrlResponse(
        signed_url=signed.signed_url,
        upload_token=token_sub_id,
        upload_url_expires_at=expires_at,
    )


@participant_router.patch("/bounties/{bounty_id}/submissions/{sub_id}")
async def update_submission(
    bounty_id: UUID,
    sub_id: UUID,
    payload: SubmissionUpdateRequest,
    user: User = Depends(require_participant),
    pool: asyncpg.Pool = Depends(get_pool),
    storage: StorageService = Depends(get_storage_service),
) -> Any:
    sub = await submissions_repo.get_by_id_and_bounty(pool, sub_id, bounty_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub["user_id"] != user.id:
        raise HTTPException(403, "Not your submission")
    if sub["status"] != "pending":
        raise HTTPException(409, "Cannot edit a submission that is under review or scored")

    target_type = payload.new_submission_type or sub["submission_type"]

    # If switching type, verify bounty supports the target
    if target_type != sub["submission_type"]:
        bounty = await bounties_repo.get_by_id(pool, bounty_id)
        if not bounty or target_type not in bounty["submission_formats"]:
            raise HTTPException(400, f"Bounty does not accept {target_type} submissions")

    fields: dict = {}
    if payload.description is not None:
        fields["description"] = payload.description

    if target_type == "zip":
        if payload.upload_token:
            new_path = await submission_service.resolve_upload_token(
                pool, payload.upload_token, user.id, bounty_id
            )
            old_path = sub.get("file_path")
            fields["file_path"] = new_path
            if target_type != sub["submission_type"]:
                fields["external_url"] = None  # clear old URL
            # clean up old file
            if old_path:
                try:
                    await storage.delete_file(old_path)
                except Exception:
                    pass
            await submissions_repo.delete_pending(pool, payload.upload_token)
        elif target_type != sub["submission_type"]:
            raise HTTPException(400, "upload_token required when switching to zip submission type")
        # else: zip→zip with no new file — only description changes
    else:
        # URL type
        if payload.external_url is not None:
            submission_service.validate_submission_url(target_type, payload.external_url)
            fields["external_url"] = payload.external_url
        elif target_type != sub["submission_type"]:
            raise HTTPException(400, "external_url required when switching to URL submission type")
        # switching away from zip: clear file_path and delete old file
        if sub["submission_type"] == "zip":
            fields["file_path"] = None
            old_path = sub.get("file_path")
            if old_path:
                try:
                    await storage.delete_file(old_path)
                except Exception:
                    pass

    if target_type != sub["submission_type"]:
        fields["submission_type"] = target_type

    return await submissions_repo.update_fields(pool, sub_id, fields)


# ── Org endpoints ─────────────────────────────────────────────────────────────


@org_router.get("/orgs/{org_id}/bounties/{bounty_id}/submissions")
async def list_submissions(
    org_id: UUID,
    bounty_id: UUID,
    status_filter: str | None = None,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
) -> list:
    # Verify bounty belongs to org
    bounty = await bounties_repo.get_for_org(pool, bounty_id, org_id)
    if not bounty:
        raise HTTPException(404, "Bounty not found")
    return await submissions_repo.list_for_bounty(pool, bounty_id, org_id, status_filter)


@org_router.patch("/orgs/{org_id}/submissions/{sub_id}/status")
async def update_submission_status(
    org_id: UUID,
    sub_id: UUID,
    payload: StatusUpdateRequest,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Any:
    sub = await submissions_repo.get_for_org(pool, sub_id, org_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    submission_service.validate_status_transition(sub["status"], payload.status)
    return await submissions_repo.update_status(pool, sub_id, payload.status, payload.review_notes)


@org_router.get("/orgs/{org_id}/submissions/{sub_id}/download-url")
async def get_download_url(
    org_id: UUID,
    sub_id: UUID,
    user: User = Depends(require_org_admin_or_moderator),
    pool: asyncpg.Pool = Depends(get_pool),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    sub = await submissions_repo.get_for_org(pool, sub_id, org_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    if not sub.get("file_path"):
        raise HTTPException(400, "Submission has no file")
    signed_url = await storage.create_signed_download_url(sub["file_path"])
    return {"download_url": signed_url}
