"""Per-user identity + Spotify token storage for multi-user Fidolio.

The `users` table holds each Spotify account's refresh token (JSON-encoded) and sync state.
`DBCacheHandler` lets spotipy read/refresh/persist a given user's token straight from the DB,
so `get_spotify_client(user_id)` works per-user with automatic token refresh.
"""
import os
import json
import psycopg2
from contextlib import contextmanager
from spotipy.cache_handler import CacheHandler

DB_URL = os.getenv("DATABASE_URL")


def _conn():
    return psycopg2.connect(DB_URL)


@contextmanager
def _cursor():
    """Yield a cursor and ALWAYS commit + close the connection. `with psycopg2.connect()` commits
    but never closes — that leaked connections and could exhaust the pool. This closes every time."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    finally:
        conn.close()


# ── User CRUD ──────────────────────────────────────────────────────────────────
def upsert_user(spotify_user_id, display_name, email, token_info):
    """Create or update a user after a successful OAuth login. Stores the token + profile.
    (`id` is the Spotify user id — the table's primary key.)"""
    with _cursor() as cur:
        cur.execute(
            """INSERT INTO users (id, display_name, email, token_info, last_login)
                   VALUES (%s, %s, %s, %s, now())
               ON CONFLICT (id) DO UPDATE SET
                   display_name = EXCLUDED.display_name,
                   email        = EXCLUDED.email,
                   token_info   = EXCLUDED.token_info,
                   last_login   = now()""",
            (spotify_user_id, display_name, email, json.dumps(token_info)),
        )


def get_user(spotify_user_id):
    """Return the user row as a dict (token_info parsed), or None."""
    with _cursor() as cur:
        cur.execute(
            """SELECT id, display_name, email, token_info,
                      sync_status, sync_detail, saved_count, last_sync
               FROM users WHERE id = %s""",
            (spotify_user_id,),
        )
        r = cur.fetchone()
    if not r:
        return None
    return {
        "spotify_user_id": r[0], "display_name": r[1], "email": r[2],
        "token_info": json.loads(r[3]) if r[3] else None,
        "sync_status": r[4], "sync_detail": r[5], "saved_count": r[6], "last_sync": r[7],
    }


def save_token(spotify_user_id, token_info):
    """Persist a refreshed token (called by spotipy via DBCacheHandler)."""
    with _cursor() as cur:
        cur.execute(
            "UPDATE users SET token_info = %s WHERE id = %s",
            (json.dumps(token_info), spotify_user_id),
        )


def set_sync_status(spotify_user_id, status, detail=None, saved_count=None, touch_last_sync=False):
    """Update sync progress for the 'warming up' UI."""
    sets, params = ["sync_status = %s"], [status]
    if detail is not None:
        sets.append("sync_detail = %s"); params.append(detail)
    if saved_count is not None:
        sets.append("saved_count = %s"); params.append(saved_count)
    if touch_last_sync:
        sets.append("last_sync = now()")
    params.append(spotify_user_id)
    with _cursor() as cur:
        cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = %s", params)


def list_user_ids():
    """All known user ids (for the poller to iterate every account)."""
    with _cursor() as cur:
        cur.execute("SELECT id FROM users")
        return [r[0] for r in cur.fetchall()]


# ── spotipy cache handler backed by the DB ─────────────────────────────────────
class DBCacheHandler(CacheHandler):
    """Reads/writes a single user's Spotify token in the `users` table, so spotipy can
    transparently refresh it and persist the new token."""

    def __init__(self, spotify_user_id):
        self.spotify_user_id = spotify_user_id

    def get_cached_token(self):
        u = get_user(self.spotify_user_id)
        return u["token_info"] if u else None

    def save_token_to_cache(self, token_info):
        # Only persists if the user row already exists (created at login); safe no-op otherwise.
        save_token(self.spotify_user_id, token_info)
