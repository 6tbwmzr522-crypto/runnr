from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import checkpoint_db, init_db
from app.routers import auth, billing, brokers, desk, profile, quotes, stats


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    try:
        yield
    finally:
        checkpoint_db()


app = FastAPI(
    title="Runnr API",
    description="Small backend for Runnr — login, encrypted broker keys, read-only sync.",
    version="0.1.9",
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Runnr-Cache", "X-Runnr-Cache-Age"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(brokers.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(quotes.router, prefix="/api/v1/quotes", tags=["quotes"])
app.include_router(desk.router, prefix="/api/v1/desk", tags=["desk"])
app.include_router(stats.router, prefix="/api/v1")


@app.get("/health")
def health():
    import os

    from app.db import (
        DB_PATH,
        db_created_at,
        path_is_persistent,
        stats_day_count,
        volume_mount_path,
    )
    from app.quote_cache import fear_greed_cache, quote_cache

    mount = volume_mount_path() or "/data"
    data_volume_ok = False
    if os.path.isdir(mount):
        probe = os.path.join(mount, ".runnr_write_probe")
        try:
            with open(probe, "w", encoding="utf-8") as fh:
                fh.write("ok")
            os.remove(probe)
            data_volume_ok = True
        except OSError:
            data_volume_ok = False

    db_bytes = 0
    try:
        db_bytes = os.path.getsize(DB_PATH)
    except OSError:
        db_bytes = 0

    key = (settings.openai_api_key or "").strip()
    fh = (settings.finnhub_api_key or "").strip()
    from app.email_util import email_configured

    return {
        "status": "ok",
        "service": "runnr-api",
        "database_path": DB_PATH,
        "database_persistent": path_is_persistent(DB_PATH),
        "database_bytes": db_bytes,
        "database_created_at": db_created_at(),
        "stats_days": stats_day_count(),
        "railway_volume_mount_path": volume_mount_path() or None,
        "data_volume_ok": data_volume_ok and path_is_persistent(DB_PATH),
        "ai_configured": bool(key),
        "ai_model": settings.openai_model,
        "finnhub_configured": bool(fh),
        "stripe_configured": settings.stripe_enabled,
        "stripe_webhook_configured": bool((settings.stripe_webhook_secret or "").strip()),
        "email_configured": email_configured(),
        "quote_cache_ttl_s": settings.quote_cache_ttl,
        "quote_stale_ttl_s": settings.quote_stale_ttl,
        "caches": {
            "quotes": quote_cache.stats(),
            "fear_greed": fear_greed_cache.stats(),
        },
    }
