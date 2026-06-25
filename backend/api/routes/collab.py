"""
Collab Playlists — backend route
---------------------------------
Everyone adds songs to a room, votes on them, top tracks become a Spotify playlist.
Unique to Fidolio: vibe guardrails — rooms can enforce audio-feature bounds so
the playlist stays coherent (e.g. Late Night cap on energy, Road Trip floor on valence).
"""

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
import psycopg2, os, uuid, spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
from core import spotify_api

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])

# ─── Vibe presets ────────────────────────────────────────────────────────────
# Each preset sets soft audio-feature bounds for the room.
# Tracks outside these bounds get a ⚠ flag (never hard-blocked).

VIBE_PRESETS = {
    "late_night": {
        "label": "Late Night 🌙",
        "energy_max": 0.60, "valence_max": 0.55,
        "description": "Chill, low energy, a little dark",
    },
    "hype": {
        "label": "Hype Session 🔥",
        "energy_min": 0.75,
        "description": "High energy only",
    },
    "road_trip": {
        "label": "Road Trip 🚗",
        "energy_min": 0.50, "energy_max": 0.88, "valence_min": 0.40,
        "description": "Mid-to-high energy, generally positive",
    },
    "good_vibes": {
        "label": "Good Vibes ☀️",
        "valence_min": 0.55,
        "description": "Happy and uplifting only",
    },
    "sad_hours": {
        "label": "Sad Hours 💧",
        "valence_max": 0.40, "energy_max": 0.55,
        "description": "Low energy, emotional",
    },
    "acoustic": {
        "label": "Acoustic 🎸",
        "energy_max": 0.55,
        "description": "Stripped back, low energy",
    },
    "workout": {
        "label": "Workout 🏋️",
        "energy_min": 0.80,
        "description": "High energy, get moving",
    },
    "dinner_party": {
        "label": "Dinner Party 🍷",
        "energy_min": 0.25, "energy_max": 0.65, "valence_min": 0.35,
        "description": "Ambient, not too loud, not too dark",
    },
}


# ─── DB helpers ──────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DB_URL)


def get_spotify():
    load_dotenv(os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', '.env')
    ), override=True)
    cache = os.path.abspath(os.getenv("SPOTIFY_CACHE_PATH") or
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache'))
    return spotipy.Spotify(auth_manager=SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE, open_browser=False, cache_path=cache,
    ))


# ─── Schema migration (additive, runs at import time) ───────────────────────

def _migrate():
    try:
        conn = get_conn(); cur = conn.cursor()
        for sql in [
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS playlist_id TEXT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS playlist_url TEXT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS vibe_preset TEXT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS energy_min FLOAT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS energy_max FLOAT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS valence_min FLOAT",
            "ALTER TABLE collab_rooms ADD COLUMN IF NOT EXISTS valence_max FLOAT",
            "ALTER TABLE collab_submissions ADD COLUMN IF NOT EXISTS album_image TEXT",
            """CREATE TABLE IF NOT EXISTS collab_reactions (
                   submission_id INTEGER NOT NULL,
                   reactor_name  TEXT NOT NULL,
                   emoji         TEXT NOT NULL,
                   PRIMARY KEY (submission_id, reactor_name))""",
        ]:
            cur.execute(sql)
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        print(f"[collab] migration note: {e}")

_migrate()


# ─── Vibe checking ───────────────────────────────────────────────────────────

def vibe_check(track_id: str, e_min, e_max, v_min, v_max) -> Optional[dict]:
    """
    Returns None if track fits vibe (or features unknown).
    Returns a warning dict if outside bounds.
    Only checks tracks in Sid's library (has audio features).
    """
    if not any([e_min, e_max, v_min, v_max]):
        return None

    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT energy, valence FROM tracks WHERE id = %s", (track_id,))
    row = cur.fetchone()
    cur.close(); conn.close()

    if not row or row[0] is None:
        return None  # not in library → can't check, allow it

    energy  = float(row[0])
    valence = float(row[1]) if row[1] is not None else 0.5

    reasons = []
    if e_min and energy  < e_min: reasons.append(f"energy {round(energy*100)}% (need ≥{round(e_min*100)}%)")
    if e_max and energy  > e_max: reasons.append(f"energy {round(energy*100)}% (need ≤{round(e_max*100)}%)")
    if v_min and valence < v_min: reasons.append(f"mood {round(valence*100)}% (need ≥{round(v_min*100)}%)")
    if v_max and valence > v_max: reasons.append(f"mood {round(valence*100)}% (need ≤{round(v_max*100)}%)")

    if not reasons:
        return None

    return {
        "outside_vibe": True,
        "energy": round(energy, 2),
        "valence": round(valence, 2),
        "reason": ", ".join(reasons),
    }


def in_vibe(energy, valence, e_min, e_max, v_min, v_max) -> bool:
    if energy is None:
        return True  # unknown → assume OK
    if e_min and float(energy) < e_min: return False
    if e_max and float(energy) > e_max: return False
    if valence is not None:
        if v_min and float(valence) < v_min: return False
        if v_max and float(valence) > v_max: return False
    return True


# ─── Request models ───────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name:        str
    owner_name:  str
    vibe_preset: Optional[str] = None

class SubmitSongRequest(BaseModel):
    room_id:     str
    track_id:    str
    track_name:  str
    artist_name: str
    album_name:  str
    album_image: Optional[str] = None
    submitted_by: str

class VoteRequest(BaseModel):
    submission_id: int
    voter_name:    str
    vote:          int  # -1, 0 (remove), or 1

class ReactRequest(BaseModel):
    submission_id: int
    reactor_name:  str
    emoji:         str  # one reaction per person per track; re-sending the same emoji clears it


# ─── Static routes ────────────────────────────────────────────────────────────

@router.get("/presets")
def get_presets():
    return {"presets": [{"id": k, **v} for k, v in VIBE_PRESETS.items()]}


@router.post("/create")
def create_room(req: CreateRoomRequest):
    room_id = str(uuid.uuid4())[:8].upper()
    preset  = VIBE_PRESETS.get(req.vibe_preset or "")

    e_min = preset.get("energy_min")  if preset else None
    e_max = preset.get("energy_max")  if preset else None
    v_min = preset.get("valence_min") if preset else None
    v_max = preset.get("valence_max") if preset else None

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO collab_rooms
            (id, name, owner_id, vibe_preset,
             energy_min, energy_max, valence_min, valence_max,
             status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'open', NOW())
    """, (room_id, req.name, req.owner_name, req.vibe_preset,
          e_min, e_max, v_min, v_max))
    conn.commit(); cur.close(); conn.close()

    return {
        "room_id":    room_id,
        "room_name":  req.name,
        "vibe_label": preset["label"] if preset else (req.vibe_preset or None),
        "share_url":  f"/collab/{room_id}",
    }


@router.post("/submit")
def submit_song(req: SubmitSongRequest):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT id, status, energy_min, energy_max, valence_min, valence_max
        FROM collab_rooms WHERE id = %s
    """, (req.room_id.upper(),))
    room = cur.fetchone()
    if not room:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")
    if room[1] == "finalized":
        cur.close(); conn.close()
        return {"success": False, "message": "Room is finalized — no new songs."}

    cur.execute("""
        SELECT id FROM collab_submissions WHERE room_id = %s AND track_id = %s
    """, (req.room_id.upper(), req.track_id))
    if cur.fetchone():
        cur.close(); conn.close()
        return {"success": False, "message": "Song already in the pool."}

    cur.execute("""
        INSERT INTO collab_submissions
            (room_id, track_id, track_name, artist_name, album_name, album_image, submitted_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
    """, (req.room_id.upper(), req.track_id, req.track_name,
          req.artist_name, req.album_name, req.album_image, req.submitted_by))
    submission_id = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO collab_votes (submission_id, voter_name, vote)
        VALUES (%s, %s, 1) ON CONFLICT (submission_id, voter_name) DO NOTHING
    """, (submission_id, req.submitted_by))
    conn.commit(); cur.close(); conn.close()

    warning = vibe_check(req.track_id, room[2], room[3], room[4], room[5])

    return {"success": True, "submission_id": submission_id, "vibe_warning": warning}


@router.post("/vote")
def vote(req: VoteRequest):
    if req.vote not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="Vote must be -1, 0, or 1")
    conn = get_conn(); cur = conn.cursor()
    if req.vote == 0:
        cur.execute("""
            DELETE FROM collab_votes WHERE submission_id = %s AND voter_name = %s
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


@router.post("/react")
def react(req: ReactRequest):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT emoji FROM collab_reactions WHERE submission_id = %s AND reactor_name = %s",
                (req.submission_id, req.reactor_name))
    row = cur.fetchone()
    if row and row[0] == req.emoji:
        cur.execute("DELETE FROM collab_reactions WHERE submission_id = %s AND reactor_name = %s",
                    (req.submission_id, req.reactor_name))
    else:
        cur.execute("""INSERT INTO collab_reactions (submission_id, reactor_name, emoji)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (submission_id, reactor_name)
                       DO UPDATE SET emoji = EXCLUDED.emoji""",
                    (req.submission_id, req.reactor_name, req.emoji))
    conn.commit(); cur.close(); conn.close()
    return {"success": True}


@router.delete("/submissions/{submission_id}")
def remove_submission(submission_id: int, caller_name: str = Query(...)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT submitted_by FROM collab_submissions WHERE id = %s", (submission_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Submission not found")
    if row[0].strip().lower() != caller_name.strip().lower():
        cur.close(); conn.close()
        raise HTTPException(status_code=403, detail="Can only remove your own submissions")
    cur.execute("DELETE FROM collab_votes WHERE submission_id = %s", (submission_id,))
    cur.execute("DELETE FROM collab_submissions WHERE id = %s", (submission_id,))
    conn.commit(); cur.close(); conn.close()
    return {"success": True}


@router.get("/search/tracks")
def search_tracks(q: str = Query(...), limit: int = Query(8)):
    try:
        sp      = get_spotify()
        results = sp.search(q=q, type="track", limit=limit)
        items   = results["tracks"]["items"]
        return {"tracks": [{
            "id":          t["id"],
            "name":        t["name"],
            "artist":      t["artists"][0]["name"],
            "album":       t["album"]["name"],
            "image":       (t["album"]["images"][1]["url"]
                            if len(t["album"]["images"]) > 1
                            else (t["album"]["images"][0]["url"]
                                  if t["album"]["images"] else None)),
            "spotify_url": t["external_urls"]["spotify"],
            "popularity":  t.get("popularity", 0),
        } for t in items]}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


# ─── Dynamic routes ───────────────────────────────────────────────────────────

@router.get("/{room_id}")
def get_room(room_id: str, voter_name: str = Query("")):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT id, name, owner_id, status, vibe_preset,
               energy_min, energy_max, valence_min, valence_max,
               playlist_url, created_at
        FROM collab_rooms WHERE id = %s
    """, (room_id.upper(),))
    room = cur.fetchone()
    if not room:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")

    e_min, e_max = room[5], room[6]
    v_min, v_max = room[7], room[8]
    preset_info  = VIBE_PRESETS.get(room[4] or "")

    cur.execute("""
        SELECT s.id, s.track_id, s.track_name, s.artist_name, s.album_name,
               s.album_image, s.submitted_by, s.submitted_at,
               COALESCE(SUM(v.vote), 0)                        AS score,
               COUNT(CASE WHEN v.vote =  1 THEN 1 END)         AS upvotes,
               COUNT(CASE WHEN v.vote = -1 THEN 1 END)         AS downvotes,
               t.energy,  t.valence
        FROM collab_submissions s
        LEFT JOIN collab_votes v ON v.submission_id = s.id
        LEFT JOIN tracks       t ON t.id = s.track_id
        WHERE s.room_id = %s
        GROUP BY s.id, t.energy, t.valence
        ORDER BY score DESC, s.submitted_at ASC
    """, (room_id.upper(),))
    rows = cur.fetchall()

    voter_votes = {}
    if voter_name:
        cur.execute("""
            SELECT submission_id, vote FROM collab_votes
            WHERE voter_name = %s
              AND submission_id IN (SELECT id FROM collab_submissions WHERE room_id = %s)
        """, (voter_name, room_id.upper()))
        voter_votes = {r[0]: r[1] for r in cur.fetchall()}

    # Reactions per submission (with the caller's own reaction flagged)
    cur.execute("""
        SELECT submission_id, emoji, COUNT(*),
               COUNT(*) FILTER (WHERE reactor_name = %s)
        FROM collab_reactions
        WHERE submission_id IN (SELECT id FROM collab_submissions WHERE room_id = %s)
        GROUP BY submission_id, emoji
    """, (voter_name, room_id.upper()))
    reactions = {}
    for sid, emoji, cnt, mine in cur.fetchall():
        reactions.setdefault(sid, []).append({"emoji": emoji, "count": int(cnt), "mine": mine > 0})

    # Members = everyone who's added or voted (no separate presence table needed)
    cur.execute("""
        SELECT DISTINCT submitted_by FROM collab_submissions WHERE room_id = %s
        UNION
        SELECT DISTINCT voter_name FROM collab_votes
          WHERE submission_id IN (SELECT id FROM collab_submissions WHERE room_id = %s)
    """, (room_id.upper(), room_id.upper()))
    members = sorted({r[0] for r in cur.fetchall() if r[0]}, key=str.lower)

    cur.close(); conn.close()

    return {
        "room_id":    room[0],
        "room_name":  room[1],
        "owner":      room[2],
        "status":     room[3] or "open",
        "vibe_preset":  room[4],
        "vibe_label":   preset_info["label"]       if preset_info else room[4],
        "vibe_desc":    preset_info["description"] if preset_info else room[4],
        "energy_min":   e_min, "energy_max": e_max,
        "valence_min":  v_min, "valence_max": v_max,
        "playlist_url": room[9],
        "created_at":   str(room[10])[:10],
        "total_songs":  len(rows),
        "members":      members,
        "submissions": [{
            "id":           r[0],
            "track_id":     r[1],
            "track_name":   r[2],
            "artist_name":  r[3],
            "album_name":   r[4],
            "album_image":  r[5],
            "submitted_by": r[6],
            "submitted_at": str(r[7])[:16],
            "score":        int(r[8]),
            "upvotes":      int(r[9]),
            "downvotes":    int(r[10]),
            "my_vote":      voter_votes.get(r[0], 0),
            "reactions":    reactions.get(r[0], []),
            "vibe_ok":      in_vibe(r[11], r[12], e_min, e_max, v_min, v_max),
            "spotify_url":  f"https://open.spotify.com/track/{r[1]}",
        } for r in rows],
    }


@router.post("/{room_id}/finalize")
def finalize_playlist(
    room_id:       str,
    min_score:     int = Query(0),
    playlist_name: str = Query(""),
    caller_name:   str = Query(""),
):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT name, owner_id, status FROM collab_rooms WHERE id = %s
    """, (room_id.upper(),))
    room = cur.fetchone()
    if not room:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Room not found")
    if room[2] == "finalized":
        cur.close(); conn.close()
        return {"success": False, "message": "Room already finalized."}

    # Owner check — soft (name comparison)
    if caller_name and room[1] and caller_name.strip().lower() != room[1].strip().lower():
        cur.close(); conn.close()
        return {
            "success": False,
            "message": f"Only {room[1]} (the room creator) can finalize the playlist.",
        }

    cur.execute("""
        SELECT s.track_id, s.track_name, s.artist_name,
               COALESCE(SUM(v.vote), 0) AS score
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
        sp   = get_spotify()
        name = playlist_name or f"Fidolio Collab: {room[0]}"
        pl   = spotify_api.create_playlist(
            sp, name, public=False,
            description=f"Collab playlist from Fidolio room {room_id}",
        )
        uris = [f"spotify:track:{t[0]}" for t in tracks]
        spotify_api.add_items(sp, pl["id"], uris)

        url = pl["url"]

        conn2 = get_conn(); cur2 = conn2.cursor()
        cur2.execute("""
            UPDATE collab_rooms
            SET status = 'finalized', playlist_id = %s, playlist_url = %s
            WHERE id = %s
        """, (pl["id"], url, room_id.upper()))
        conn2.commit(); cur2.close(); conn2.close()

        return {
            "success":       True,
            "playlist_name": name,
            "track_count":   len(tracks),
            "playlist_url":  url,
        }
    except Exception as e:
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            msg = "Spotify returned 403 — re-run python scripts/reauth_server.py to refresh the token."
        return {"success": False, "message": msg}
