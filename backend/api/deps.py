"""FastAPI dependencies shared across routes."""
import os
from fastapi import Request, HTTPException
from core.session import verify, token_from_request

# Guests (not logged in) see this account's data as a read-only public demo — Spotify dev mode caps
# us at a handful of allow-listed logins, so everyone else explores the owner's library.
DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "0tz6fep2m5bx1vq85g48518u9")


def get_current_user(request: Request) -> str:
    """READ scope: the logged-in user (Bearer token or cookie), or the demo owner for guests."""
    return verify(token_from_request(request)) or DEFAULT_USER_ID


def require_user(request: Request) -> str:
    """WRITE scope: a real logged-in user only (401 for guests). Use for anything that modifies a
    Spotify account or the DB (unsave, playlist create/edit/delete/sync) so a demo visitor can never
    touch the owner's library."""
    uid = verify(token_from_request(request))
    if not uid:
        raise HTTPException(status_code=401, detail="Log in with Spotify to do that.")
    return uid
