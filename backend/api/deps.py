"""FastAPI dependencies shared across routes."""
import os
from fastapi import Request
from core.session import verify, COOKIE_NAME

# Until the frontend always authenticates (Phase 4), an unauthenticated request falls back to this
# account so nothing breaks mid-migration. Remove the fallback (raise 401 instead) once login ships.
DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "0tz6fep2m5bx1vq85g48518u9")


def get_current_user(request: Request) -> str:
    """The acting user's Spotify id, from the signed session cookie (or the default fallback)."""
    return verify(request.cookies.get(COOKIE_NAME, "")) or DEFAULT_USER_ID
