import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os
from dotenv import load_dotenv

load_dotenv()

SCOPE = " ".join([
    "user-library-read",
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
    once so spotipy can use + refresh it. No-op locally.
    """
    raw = os.getenv("SPOTIFY_TOKEN_CACHE")
    path = resolve_cache_path()
    if raw and not os.path.exists(path):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(raw)
        except Exception as e:
            print(f"[spotify] could not write token cache: {e}")


def get_spotify_client():
    bootstrap_cache()
    auth_manager = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE,
        open_browser=False,
        cache_path=resolve_cache_path(),
    )
    return spotipy.Spotify(auth_manager=auth_manager)
