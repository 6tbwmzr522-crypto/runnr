from typing import Any, Optional

from pydantic import BaseModel, Field


class ProfileStateResponse(BaseModel):
    state: Optional[dict[str, Any]] = None
    updated_at: Optional[str] = None


class ProfileStatePut(BaseModel):
    state: dict[str, Any] = Field(..., description="Full Runnr client state (journal, watchlist, settings)")
