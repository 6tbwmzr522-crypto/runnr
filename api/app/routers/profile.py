import json

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import get_db
from app.models.profile import ProfileStatePut, ProfileStateResponse

router = APIRouter(prefix="/profile", tags=["profile"])

MAX_STATE_BYTES = 2_000_000


@router.get("/state", response_model=ProfileStateResponse)
def get_state(user: dict = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT state_json, updated_at FROM user_state WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
    if not row:
        return ProfileStateResponse(state=None, updated_at=None)
    try:
        state = json.loads(row["state_json"])
    except json.JSONDecodeError:
        return ProfileStateResponse(state=None, updated_at=row["updated_at"])
    return ProfileStateResponse(state=state, updated_at=row["updated_at"])


@router.put("/state", response_model=ProfileStateResponse)
def put_state(body: ProfileStatePut, user: dict = Depends(get_current_user)):
    raw = json.dumps(body.state, separators=(",", ":"))
    if len(raw.encode("utf-8")) > MAX_STATE_BYTES:
        raise HTTPException(status_code=413, detail="Profile state too large")
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO user_state (user_id, state_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                state_json = excluded.state_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user["id"], raw),
        )
        row = conn.execute(
            "SELECT updated_at FROM user_state WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
    return ProfileStateResponse(state=body.state, updated_at=row["updated_at"] if row else None)
