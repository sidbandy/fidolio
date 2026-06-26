"""Spotify OAuth + session for multi-user Fidolio.

Flow: /auth/login -> Spotify consent -> /auth/callback (sets a signed HttpOnly cookie, upserts the
user + token, kicks off their first sync) -> redirect to the frontend. /auth/me reports who's logged
in (+ sync progress); /auth/logout clears the cookie.
"""
import os
import spotipy
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from spotipy.oauth2 import SpotifyOAuth
from spotipy.cache_handler import MemoryCacheHandler

from core.spotify_client import _oauth_common
from core.users import upsert_user, get_user
from core.session import sign, verify, COOKIE_NAME, MAX_AGE

router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
# Cross-site cookie (Vercel <-> Railway) needs SameSite=None;Secure in prod; Lax/no-secure for local http.
_SECURE = FRONTEND_URL.startswith("https")
_SAMESITE = "none" if _SECURE else "lax"


def _oauth():
    """A fresh OAuth manager with an in-memory cache (we persist to the DB ourselves after login)."""
    return SpotifyOAuth(cache_handler=MemoryCacheHandler(), show_dialog=True, **_oauth_common())


@router.get("/login")
def login():
    """Send the user to Spotify's consent screen."""
    return RedirectResponse(_oauth().get_authorize_url())


@router.get("/callback")
def callback(code: str = None, error: str = None):
    """Spotify redirects here. Exchange the code, identify the user, store their token, set session."""
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error={error or 'cancelled'}")
    try:
        oauth = _oauth()
        oauth.get_access_token(code, check_cache=False)          # exchanges + caches in memory
        token_info = oauth.cache_handler.get_cached_token()      # full token dict (access/refresh/expires/scope)
        me = spotipy.Spotify(auth=token_info["access_token"]).current_user()
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error={type(e).__name__}")

    uid = me["id"]
    is_new = get_user(uid) is None
    upsert_user(uid, me.get("display_name") or uid, me.get("email"), token_info)

    # First-time login only: kick off full library ingestion in the background (SyncGate covers them
    # while there are no tracks yet). Returning users are kept current by the daily library sync in
    # the poller — we do NOT re-sync on every login.
    if is_new:
        try:
            from core.user_sync import start_first_sync
            start_first_sync(uid)
        except Exception:
            pass

    resp = RedirectResponse(FRONTEND_URL)
    resp.set_cookie(COOKIE_NAME, sign(uid), max_age=MAX_AGE,
                    httponly=True, secure=_SECURE, samesite=_SAMESITE, path="/")
    return resp


@router.get("/me")
def me(request: Request):
    """Who is this browser? Logged-in users get their profile + sync progress; guests get a flag and
    the demo owner's name (everyone can explore the owner's library read-only — Spotify dev mode caps
    real logins)."""
    uid = verify(request.cookies.get(COOKIE_NAME, ""))
    u = get_user(uid) if uid else None
    if u:
        return {
            "authenticated": True,
            "user_id":       u["spotify_user_id"],
            "display_name":  u["display_name"],
            "sync_status":   u["sync_status"],
            "sync_detail":   u["sync_detail"],
            "saved_count":   u["saved_count"],
        }
    from api.deps import DEFAULT_USER_ID
    demo = get_user(DEFAULT_USER_ID)
    return {"authenticated": False, "demo_owner": (demo or {}).get("display_name") or "Fidolio"}


@router.post("/logout")
def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/", samesite=_SAMESITE, secure=_SECURE)
    return resp
