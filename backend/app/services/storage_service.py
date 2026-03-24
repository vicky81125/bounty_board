import re
from dataclasses import dataclass

import anyio
from fastapi import HTTPException, Request
from supabase import create_client, Client

STORAGE_PATH_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$"
)

BUCKET = "submissions"


@dataclass
class SignedUploadUrl:
    signed_url: str
    token: str = ""


def _validate_storage_path(path: str) -> str:
    if not STORAGE_PATH_RE.match(path):
        raise ValueError(f"Malformed storage path rejected: {path!r}")
    return path


class StorageService:
    """Singleton — initialized once at startup via lifespan, stored on app.state.storage.
    supabase-py Storage is synchronous; all calls are wrapped in anyio.to_thread.run_sync.
    """

    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self.client: Client = create_client(supabase_url, service_role_key)

    async def create_signed_upload_url(self, path: str) -> SignedUploadUrl:
        validated = _validate_storage_path(path)
        try:
            result = await anyio.to_thread.run_sync(
                lambda: self.client.storage.from_(BUCKET).create_signed_upload_url(validated)
            )
        except Exception as e:
            raise HTTPException(503, f"Storage service error: {e}")
        # supabase-py 2.x returns an object with .signed_url attribute (not a dict)
        if isinstance(result, dict):
            url = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url", "")
            token = result.get("token", "")
        else:
            url = getattr(result, "signed_url", "") or getattr(result, "signedURL", "")
            token = getattr(result, "token", "")
        return SignedUploadUrl(signed_url=url, token=token)

    async def create_signed_download_url(self, path: str, expires_in: int = 3600) -> str:
        validated = _validate_storage_path(path)
        try:
            result = await anyio.to_thread.run_sync(
                lambda: self.client.storage.from_(BUCKET).create_signed_url(validated, expires_in)
            )
        except Exception as e:
            raise HTTPException(503, f"Storage service error: {e}")
        if isinstance(result, dict):
            return result.get("signedURL") or result.get("signedUrl") or result.get("signed_url", "")
        return getattr(result, "signed_url", "") or getattr(result, "signedURL", "")

    async def delete_file(self, path: str) -> None:
        """Delete a file from storage. Used when replacing zip (Phase 4+)."""
        validated = _validate_storage_path(path)
        await anyio.to_thread.run_sync(
            lambda: self.client.storage.from_(BUCKET).remove([validated])
        )


async def get_storage_service(request: Request) -> StorageService:
    return request.app.state.storage
