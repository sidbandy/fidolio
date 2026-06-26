import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import stats, library, search, discovery, nowplaying, albums, collab, playlists, auth

# In the cloud, write the Spotify token from SPOTIFY_TOKEN_CACHE env to disk once.
try:
    from core.spotify_client import bootstrap_cache
    bootstrap_cache()
except Exception as _e:
    print(f"[startup] token bootstrap skipped: {_e}")

app = FastAPI(title="Fidolio API", version="1.0.0")

# Allowed origins come from env (comma-separated) so the deployed frontend
# can talk to the deployed backend. Defaults cover local dev.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Vercel preview + prod deploys
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/auth",        tags=["auth"])
app.include_router(stats.router,       prefix="/stats",       tags=["stats"])
app.include_router(library.router,     prefix="/library",     tags=["library"])
app.include_router(search.router,      prefix="/search",      tags=["search"])
app.include_router(discovery.router,   prefix="/discovery",   tags=["discovery"])
app.include_router(nowplaying.router,  prefix="/nowplaying",  tags=["nowplaying"])
app.include_router(albums.router,      prefix="/albums",      tags=["albums"])
app.include_router(collab.router,      prefix="/collab",      tags=["collab"])
app.include_router(playlists.router,   prefix="/playlists",   tags=["playlists"])

@app.get("/")
def root():
    return {"status": "Fidolio is running"}


# ── Hourly in-app poller ──────────────────────────────────────────────────────
# Keeps listening history + the saved library current in the cloud, so nothing
# needs to run on a laptop. The Procfile runs a single uvicorn worker, so there's
# exactly one scheduler. Set ENABLE_POLLER=0 to turn it off (e.g. local dev).
import threading
import time as _time


def _poll_loop():
    _time.sleep(25)  # let the app finish booting first
    while True:
        try:
            import run_poller
            run_poller.main()  # recent plays + incremental saved-tracks sync
        except Exception as e:
            print(f"[scheduler] hourly poll failed: {e}")
        _time.sleep(3600)  # every hour


@app.on_event("startup")
def _start_poller():
    if os.getenv("ENABLE_POLLER", "1") != "0":
        threading.Thread(target=_poll_loop, daemon=True, name="fidolio-poller").start()
        print("[scheduler] in-app hourly poller started")