import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os
from dotenv import load_dotenv

load_dotenv()

SCOPE = " ".join([
    "user-library-read",
    "user-library-modify",          # un-save tracks (swipe-to-remove)
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-currently-playing",
    "user-read-playback-state",
])


def resolve_cache_path():
    """
    Where the Spotify OAuth token lives.
    Locally: project-root .cache. In the cloud: set SPOTIFY_CACHE_PATH
    (e.g. /app/.cache on Railway) so it lands somewhere writable.
    """
    env = os.getenv("SPOTIFY_CACHE_PATH")
    if env:
        return os.path.abspath(env)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.cache'))


def bootstrap_cache():
    """
    On a fresh cloud container there's no .cache file. If SPOTIFY_TOKEN_CACHE
    is set (paste your local .cache JSON into that env var), write it to disk
    so spotipy can use + refresh it. No-op locally.

    Sanitizes the value: a `cat .cache` paste often picks up a trailing zsh `%`
    or stray whitespace, which makes the JSON unparseable ("Extra data"). We
    trim to the JSON object so it's always valid.
    """
    import json
    raw = os.getenv("SPOTIFY_TOKEN_CACHE")
    if not raw:
        return
    raw = raw.strip()
    # Trim anything after the final closing brace (e.g. a trailing '%')
    if not raw.endswith("}") and "}" in raw:
        raw = raw[: raw.rfind("}") + 1]
    try:
        json.loads(raw)  # validate before writing
    except Exception as e:
        print(f"[spotify] SPOTIFY_TOKEN_CACHE is not valid JSON: {e}")
        return
    path = resolve_cache_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Always (re)write so a corrupted cache from a prior boot is replaced
        with open(path, "w") as f:
            f.write(raw)
    except Exception as e:
        print(f"[spotify] could not write token cache: {e}")


def _oauth_common():
    return dict(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE,
        open_browser=False,
    )


def get_spotify_client(user_id=None):
    """Spotify client for a given user — token comes from the DB and spotipy auto-refreshes it.
    Falls back to the legacy single-account file cache when there's no user_id, or when the user has
    no DB token yet (e.g. the original default account whose token lives in the .cache file)."""
    if user_id:
        from core.users import get_user, DBCacheHandler
        u = get_user(user_id)
        if u and u.get("token_info"):
            return spotipy.Spotify(auth_manager=SpotifyOAuth(cache_handler=DBCacheHandler(user_id), **_oauth_common()))
    # Legacy/default file-cache account. Match the cached token's OWN scope so a narrower legacy
    # token (e.g. one issued before user-library-modify was added) is never invalidated — otherwise
    # spotipy would try interactive re-auth and fail headless. New OAuth users get the full SCOPE.
    bootstrap_cache()
    common = _oauth_common()
    try:
        import json
        scope = json.load(open(resolve_cache_path())).get("scope")
        if scope:
            common = {**common, "scope": scope}
    except Exception:
        pass
    return spotipy.Spotify(auth_manager=SpotifyOAuth(cache_path=resolve_cache_path(), **common))
