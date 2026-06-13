from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
import psycopg2, os, uuid, spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])

def get_conn():
    return psycopg2.connect(DB_URL)

def get_spotify():
    # Load env explicitly so credentials are always available
    env_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', '.env')
    )
    load_dotenv(env_path, override=True)
    cache_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache')
    )
    auth = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE, open_browser=False, cache_path=cache_path
    )
    return spotipy.Spotify(auth_manager=auth)


class CreateRoomRequest(BaseModel):
    name: str
    owner_name: str

class SubmitSongRequest(BaseModel):
    room_id:     str
    track_id:    str
    track_name:  str
    artist_name: str
    album_name:  str
    submitted_by: str

class VoteRequest(BaseModel):
    submission_id: int
    voter_name:    str
    vote:          int


# ── STATIC ROUTES FIRST (before any dynamic /{room_id}) ──────────────────

@router.post("/create")
def create_room(req: CreateRoomRequest):
    room_id = str(uuid.uuid4())[:8].upper()
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO collab_rooms (id, name, owner_id, created_at)
        VALUES (%s, %s, %s, NOW())
    """, (room_id, req.name, req.owner_name))
    conn.commit(); cur.close(); conn.close()
    return {"room_id": room_id, "room_name": req.name,
            "share_url": f"/collab/{room_id}"}


@router.post("/submit")
def submit_song(req: SubmitSongRequest):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT id FROM collab_rooms WHERE id = %s", (req.room_id.upper(),))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")
    cur.execute("""
        SELECT id FROM collab_submissions
        WHERE room_id = %s AND track_id = %s
    """, (req.room_id.upper(), req.track_id))
    if cur.fetchone():
        cur.close(); conn.close()
        return {"success": False, "message": "Song already in the pool."}
    cur.execute("""
        INSERT INTO collab_submissions
            (room_id, track_id, track_name, artist_name, album_name, submitted_by)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
    """, (req.room_id.upper(), req.track_id, req.track_name,
          req.artist_name, req.album_name, req.submitted_by))
    submission_id = cur.fetchone()[0]
    cur.execute("""
        INSERT INTO collab_votes (submission_id, voter_name, vote)
        VALUES (%s, %s, 1) ON CONFLICT (submission_id, voter_name) DO NOTHING
    """, (submission_id, req.submitted_by))
    conn.commit(); cur.close(); conn.close()
    return {"success": True, "submission_id": submission_id}


@router.post("/vote")
def vote(req: VoteRequest):
    if req.vote not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="Vote must be -1, 0, or 1")
    conn = get_conn(); cur = conn.cursor()
    if req.vote == 0:
        cur.execute("""
            DELETE FROM collab_votes
            WHERE submission_id = %s AND voter_name = %s
        """, (req.submission_id, req.voter_name))
    else:
        cur.execute("""
            INSERT INTO collab_votes (submission_id, voter_name, vote)
            VALUES (%s, %s, %s)
            ON CONFLICT (submission_id, voter_name)
            DO UPDATE SET vote = EXCLUDED.vote, voted_at = NOW()
        """, (req.submission_id, req.voter_name, req.vote))
    conn.commit()
    cur.execute("""
        SELECT COALESCE(SUM(vote), 0) FROM collab_votes WHERE submission_id = %s
    """, (req.submission_id,))
    score = cur.fetchone()[0]
    cur.close(); conn.close()
    return {"success": True, "new_score": int(score)}


@router.get("/search/tracks")
def search_tracks(q: str = Query(...), limit: int = Query(8)):
    """Search Spotify catalog for songs to add to a room."""
    try:
        sp      = get_spotify()
        results = sp.search(q=q, type="track", limit=limit)
        items   = results["tracks"]["items"]
        return {"tracks": [{
            "id":          t["id"],
            "name":        t["name"],
            "artist":      t["artists"][0]["name"],
            "album":       t["album"]["name"],
            "image":       t["album"]["images"][1]["url"] if len(t["album"]["images"]) > 1 else None,
            "spotify_url": t["external_urls"]["spotify"],
            "popularity":  t.get("popularity", 0),
        } for t in items]}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


# ── DYNAMIC ROUTES LAST ───────────────────────────────────────────────────

@router.get("/{room_id}")
def get_room(room_id: str, voter_name: str = Query("")):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT id, name, owner_id FROM collab_rooms WHERE id = %s",
                (room_id.upper(),))
    room = cur.fetchone()
    if not room:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")
    cur.execute("""
        SELECT s.id, s.track_id, s.track_name, s.artist_name, s.album_name,
               s.submitted_by, s.submitted_at,
               COALESCE(SUM(v.vote), 0) as score,
               COUNT(CASE WHEN v.vote =  1 THEN 1 END) as upvotes,
               COUNT(CASE WHEN v.vote = -1 THEN 1 END) as downvotes
        FROM collab_submissions s
        LEFT JOIN collab_votes v ON v.submission_id = s.id
        WHERE s.room_id = %s
        GROUP BY s.id
        ORDER BY score DESC, s.submitted_at ASC
    """, (room_id.upper(),))
    rows = cur.fetchall()
    voter_votes = {}
    if voter_name:
        cur.execute("""
            SELECT submission_id, vote FROM collab_votes
            WHERE voter_name = %s
              AND submission_id IN (
                SELECT id FROM collab_submissions WHERE room_id = %s
              )
        """, (voter_name, room_id.upper()))
        voter_votes = {r[0]: r[1] for r in cur.fetchall()}
    cur.close(); conn.close()
    return {
        "room_id":   room[0],
        "room_name": room[1],
        "owner":     room[2],
        "submissions": [{
            "id":           r[0],
            "track_id":     r[1],
            "track_name":   r[2],
            "artist_name":  r[3],
            "album_name":   r[4],
            "submitted_by": r[5],
            "submitted_at": str(r[6])[:16],
            "score":        int(r[7]),
            "upvotes":      int(r[8]),
            "downvotes":    int(r[9]),
            "my_vote":      voter_votes.get(r[0], 0),
            "spotify_url":  f"https://open.spotify.com/track/{r[1]}",
        } for r in rows],
        "total_songs": len(rows),
    }


@router.post("/{room_id}/finalize")
def finalize_playlist(
    room_id:       str,
    min_score:     int = Query(0),
    playlist_name: str = Query("")
):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT name FROM collab_rooms WHERE id = %s", (room_id.upper(),))
    room = cur.fetchone()
    if not room:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")
    cur.execute("""
        SELECT s.track_id, s.track_name, s.artist_name,
               COALESCE(SUM(v.vote), 0) as score
        FROM collab_submissions s
        LEFT JOIN collab_votes v ON v.submission_id = s.id
        WHERE s.room_id = %s
        GROUP BY s.track_id, s.track_name, s.artist_name
        HAVING COALESCE(SUM(v.vote), 0) >= %s
        ORDER BY score DESC
    """, (room_id.upper(), min_score))
    tracks = cur.fetchall()
    cur.close(); conn.close()
    if not tracks:
        return {"success": False, "message": "No songs meet the minimum score."}
    try:
        sp       = get_spotify()
        sp_user  = sp.current_user()
        name     = playlist_name or f"Fidolio Collab: {room[0]}"
        playlist = sp.user_playlist_create(
            sp_user["id"], name, public=False,
            description=f"Collab playlist from Fidolio room {room_id}"
        )
        uris = [f"spotify:track:{t[0]}" for t in tracks]
        for i in range(0, len(uris), 100):
            sp.playlist_add_items(playlist["id"], uris[i:i+100])
        return {
            "success":       True,
            "playlist_name": name,
            "track_count":   len(tracks),
            "playlist_url":  playlist["external_urls"]["spotify"]
        }
    except Exception as e:
        return {"success": False, "message": str(e)}