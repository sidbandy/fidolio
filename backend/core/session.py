"""Signed session cookie — stdlib only (no new dependency).

The cookie value is `base64(payload).base64(hmac_sha256(payload, secret))` where payload is
`<spotify_user_id>|<issued_unix_ts>`. We never store anything secret in it; it only attests
"this browser is user X", verified by HMAC so it can't be forged or tampered with.
"""
import os
import hmac
import time
import base64
import hashlib

COOKIE_NAME = "fidolio_session"
MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def _secret() -> bytes:
    # Dedicated secret in prod; falls back to the Spotify secret, then a dev-only constant.
    return (os.getenv("SESSION_SECRET")
            or os.getenv("SPOTIFY_CLIENT_SECRET")
            or "fidolio-dev-insecure-secret").encode()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(user_id: str) -> str:
    payload = f"{user_id}|{int(time.time())}".encode()
    sig = hmac.new(_secret(), payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(sig)}"


def verify(token: str, max_age: int = MAX_AGE):
    """Return the user_id if the token is valid and unexpired, else None."""
    if not token or "." not in token:
        return None
    try:
        p_b64, sig_b64 = token.split(".", 1)
        payload = _unb64(p_b64)
        expected = hmac.new(_secret(), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(sig_b64)):
            return None
        user_id, ts = payload.decode().rsplit("|", 1)
        if max_age and (time.time() - int(ts)) > max_age:
            return None
        return user_id or None
    except Exception:
        return None


def token_from_request(request) -> str:
    """Get the session token from the `Authorization: Bearer` header (reliable cross-site, immune to
    third-party-cookie blocking) or, failing that, the cookie. Duck-typed on a Starlette Request."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth[:7].lower() == "bearer ":
        return auth[7:].strip()
    try:
        return request.cookies.get(COOKIE_NAME, "") or ""
    except Exception:
        return ""
