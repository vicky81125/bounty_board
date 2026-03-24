from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import bounties, identity, orgs
from app.config import get_settings
from app.database.connection import create_pool
from app.middleware.auth import authenticate_request
from app.middleware.csrf_middleware import CSRFMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.db = await create_pool(settings)
    yield
    await app.state.db.close()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Bounty Board API",
        version="0.1.0",
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url="/api/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # Rate limiter
    from app.api.routes.identity import limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # Middleware order is critical:
    # 1. CORS — must be outermost; allow_credentials=True requires explicit origin list
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", settings.csrf_token_header],
    )

    # 2. CSRF — pure ASGI, no response buffering
    app.add_middleware(CSRFMiddleware)

    # 3. GZip
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Auth runs as a middleware function on every request (sets request.state)
    app.middleware("http")(authenticate_request_middleware)

    # Routes — order matters: /orgs/mine must come before /orgs/{org_id}
    app.include_router(identity.router, prefix=settings.api_prefix)
    app.include_router(orgs.router, prefix=settings.api_prefix)
    app.include_router(bounties.router, prefix=settings.api_prefix)
    app.include_router(_health_router())

    return app


async def authenticate_request_middleware(request, call_next):
    await authenticate_request(request)
    return await call_next(request)


def _health_router():
    from fastapi import APIRouter
    router = APIRouter(tags=["health"])

    @router.get("/api/health")
    async def health():
        return {"status": "ok"}

    return router


app = create_app()
