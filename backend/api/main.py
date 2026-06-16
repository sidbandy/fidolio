import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import stats, library, search, discovery, nowplaying, albums, collab, playlists

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