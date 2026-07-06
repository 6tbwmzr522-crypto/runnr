from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import auth, brokers, profile, quotes


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Runnr API",
    description="Small backend for Runnr — login, encrypted broker keys, read-only sync.",
    version="0.1.0",
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
app.include_router(brokers.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(quotes.router, prefix="/api/v1/quotes", tags=["quotes"])


@app.get("/health")
def health():
    from app.db import DB_PATH
    from app.quote_cache import fear_greed_cache, quote_cache

    key = (settings.openai_api_key or "").strip()
    fh = (settings.finnhub_api_key or "").strip()
    return {
        "status": "ok",
        "service": "runnr-api",
        "database_path": DB_PATH,
        "ai_configured": bool(key),
        "ai_model": settings.openai_model,
        "finnhub_configured": bool(fh),
        "quote_cache_ttl_s": settings.quote_cache_ttl,
        "caches": {
            "quotes": quote_cache.stats(),
            "fear_greed": fear_greed_cache.stats(),
        },
    }
