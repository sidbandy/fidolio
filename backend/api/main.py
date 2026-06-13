from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import stats, library, search, discovery, nowplaying, albums, collab

app = FastAPI(title="Fidolio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

@app.get("/")
def root():
    return {"status": "Fidolio is running"}