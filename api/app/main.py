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
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(brokers.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(quotes.router, prefix="/api/v1/quotes", tags=["quotes"])


@app.get("/health")
def health():
    from app.db import DB_PATH

    key = (settings.openai_api_key or "").strip()
    return {
        "status": "ok",
        "service": "runnr-api",
        "database_path": DB_PATH,
        "ai_configured": bool(key),
        "ai_model": settings.openai_model,
        "ai_key_prefix": key[:7] + "…" if len(key) > 8 else None,
    }
