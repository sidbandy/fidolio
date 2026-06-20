from fastapi import APIRouter, Query
from typing import Optional, List
import psycopg2
import requests
import os
import time as _time
from datetime import datetime
from dotenv import load_dotenv
from core import similarity
from api.routes.library import compute_moods, fetch_album_cover, MOODS

load_dotenv()
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")
RECCOBEATS_BASE = "https://api.reccobeats.com/v1"
LASTFM_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_URL = "http://ws.audioscrobbler.com/2.0/"
FEAT_COLS = "energy, valence, tempo, danceability, acousticness"

# Language preference weights — used to score results
LANGUAGE_SCORES = {
    "en": 1.0, "hi": 0.8, "bn": 0.6, "ar": 0.6,
    "zh": 0.3, "ja": 0.3
}

# Artists known to be non-English that you'd never want
BLOCKED_PATTERNS = [
    "cumbia", "reggaeton", "kizomba", "afrobeat",
    "turkish", "korean", "k-pop", "latin pop",
]

def get_conn():
    return psycopg2.connect(DB_URL)

def get_time_context():
    hour = datetime.now().hour
    if 5 <= hour < 12:  return "morning"
    if 12 <= hour < 17: return "afternoon"
    if 17 <= hour < 21: return "evening"
    return "night"

def get_hour_profile(cur, user_id):
    hour = datetime.now().hour
    cur.execute("""
        SELECT AVG(t.energy), AVG(t.valence), AVG(t.tempo),
               AVG(t.danceability), AVG(t.acousticness), COUNT(*)
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s
          AND EXTRACT(hour FROM lh.played_at) BETWEEN %s AND %s
          AND t.energy IS NOT NULL
    """, (user_id, max(0, hour-2), min(23, hour+2)))
    row = cur.fetchone()
    if not row or not row[0] or row[5] < 5:
        return None
    return {"energy": float(row[0]), "valence": float(row[1]),
            "tempo": float(row[2]), "danceability": float(row[3]),
            "acousticness": float(row[4])}

def get_recent_profile(cur, user_id, days=7):
    cur.execute("""
        SELECT AVG(t.energy), AVG(t.valence), AVG(t.tempo),
               AVG(t.danceability), AVG(t.acousticness), COUNT(*)
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s
          AND lh.played_at >= NOW() - INTERVAL '1 day' * %s
          AND t.energy IS NOT NULL
    """, (user_id, days))
    row = cur.fetchone()
    if not row or not row[0] or row[5] < 5:
        return None
    return {"energy": float(row[0]), "valence": float(row[1]),
            "tempo": float(row[2]), "danceability": float(row[3]),
            "acousticness": float(row[4])}

def get_alltime_profile(cur, user_id):
    cur.execute("""
        SELECT AVG(energy), AVG(valence), AVG(tempo),
               AVG(danceability), AVG(acousticness)
        FROM tracks WHERE user_id = %s AND energy IS NOT NULL
    """, (user_id,))
    row = cur.fetchone()
    return {"energy": float(row[0] or 0.5), "valence": float(row[1] or 0.5),
            "tempo": float(row[2] or 120), "danceability": float(row[3] or 0.5),
            "acousticness": float(row[4] or 0.3)}

def get_artist_profile(cur, user_id, artists: list):
    """Get audio feature profile of specific artists from your library."""
    placeholders = ",".join(["%s"] * len(artists))
    like_conditions = " OR ".join([f"LOWER(artist) LIKE %s" for _ in artists])
    params = [f"%{a.lower()}%" for a in artists] + [user_id]
    cur.execute(f"""
        SELECT AVG(energy), AVG(valence), AVG(tempo),
               AVG(danceability), AVG(acousticness), COUNT(*)
        FROM tracks
        WHERE ({like_conditions}) AND user_id = %s AND energy IS NOT NULL
    """, params)
    row = cur.fetchone()
    if not row or not row[0] or row[5] == 0:
        return None
    return {"energy": float(row[0]), "valence": float(row[1]),
            "tempo": float(row[2]), "danceability": float(row[3]),
            "acousticness": float(row[4])}

def merge(profiles_weights):
    keys = ["energy", "valence", "tempo", "danceability", "acousticness"]
    total = sum(w for p, w in profiles_weights if p)
    if not total:
        return {}
    return {k: sum(p[k]*w for p,w in profiles_weights if p and p.get(k)) / total
            for k in keys}

def parse_vibe(vibe: str) -> dict:
    v = vibe.lower()
    f = {}
    if any(w in v for w in ["hype","pump","workout","intense","energetic","banger","rage"]):
        f["energy"] = 0.88; f["valence"] = 0.65
    elif any(w in v for w in ["chill","calm","relax","mellow","soft","peaceful","lofi"]):
        f["energy"] = 0.22; f["acousticness"] = 0.65
    elif any(w in v for w in ["study","focus","work","concentrate","productive"]):
        f["energy"] = 0.32; f["speechiness"] = 0.04; f["acousticness"] = 0.5
    elif any(w in v for w in ["sad","heartbreak","cry","dark","depressed","melancholy","emotional","emo"]):
        f["valence"] = 0.15; f["energy"] = 0.28
    elif any(w in v for w in ["happy","upbeat","good vibes","feel good","fun","joyful"]):
        f["valence"] = 0.85; f["energy"] = 0.72
    elif any(w in v for w in ["party","dance","club","floor","groove","turn up"]):
        f["danceability"] = 0.88; f["energy"] = 0.82
    elif any(w in v for w in ["late night","2am","3am","midnight","insomnia"]):
        f["energy"] = 0.42; f["valence"] = 0.32; f["acousticness"] = 0.35
    elif any(w in v for w in ["driving","road trip","highway","windows down"]):
        f["energy"] = 0.72; f["valence"] = 0.6; f["tempo"] = 125.0
    elif any(w in v for w in ["nostalgic","throwback","memories","reminisce"]):
        f["valence"] = 0.55; f["acousticness"] = 0.45
    elif any(w in v for w in ["acoustic","folk","raw","unplugged","stripped","campfire"]):
        f["acousticness"] = 0.88; f["energy"] = 0.25
    elif any(w in v for w in ["gym","run","sprint","cardio","lift"]):
        f["energy"] = 0.92; f["tempo"] = 145.0; f["danceability"] = 0.7
    return f

def get_seeds_from_library(cur, user_id, artists=None, limit=5):
    """
    Get seed track IDs from your library.
    Prioritizes: recently played > most played > artist match > random saved.
    """
    # If artists specified, use those
    if artists:
        like_conditions = " OR ".join([f"LOWER(artist) LIKE %s" for _ in artists])
        params = [f"%{a.lower()}%" for a in artists] + [user_id]
        cur.execute(f"""
            SELECT t.id FROM tracks t
            LEFT JOIN listening_history lh ON lh.track_id = t.id
            WHERE ({like_conditions}) AND t.user_id = %s
              AND t.reccobeats_id IS NOT NULL
            GROUP BY t.id
            ORDER BY COUNT(lh.id) DESC
            LIMIT %s
        """, params + [limit])
        rows = cur.fetchall()
        if rows:
            return [r[0] for r in rows]

    # Use recently played tracks as seeds
    cur.execute("""
        SELECT lh.track_id, COUNT(*) as plays
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s
          AND t.reccobeats_id IS NOT NULL
          AND lh.played_at >= NOW() - INTERVAL '14 days'
        GROUP BY lh.track_id
        ORDER BY plays DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    if rows:
        return [r[0] for r in rows]

    # Fallback: random from library
    cur.execute("""
        SELECT id FROM tracks
        WHERE user_id = %s AND reccobeats_id IS NOT NULL
        ORDER BY RANDOM() LIMIT %s
    """, (user_id, limit))
    return [r[0] for r in cur.fetchall()]

def get_library_matches(cur, user_id, features, artists=None, limit=3):
    """
    Get songs from YOUR library that match the target vibe.
    These are always included in results.
    """
    filters = ["user_id = %s", "energy IS NOT NULL"]
    params = [user_id]

    if artists:
        like_conditions = " OR ".join([f"LOWER(artist) LIKE %s" for _ in artists])
        filters.append(f"({like_conditions})")
        params.extend([f"%{a.lower()}%" for a in artists])

    energy = features.get("energy", 0.5)
    valence = features.get("valence", 0.5)
    tempo = features.get("tempo", 120)

    params.extend([
        max(0, energy - 0.2), min(1, energy + 0.2),
        max(0, valence - 0.25), min(1, valence + 0.25),
        max(0, tempo - 25), min(300, tempo + 25),
        limit
    ])

    cur.execute(f"""
        SELECT id, name, artist, album, energy, valence, tempo, preview_url
        FROM tracks
        WHERE {' AND '.join(filters)}
          AND energy BETWEEN %s AND %s
          AND valence BETWEEN %s AND %s
          AND tempo BETWEEN %s AND %s
        ORDER BY RANDOM()
        LIMIT %s
    """, params)

    return [{
        "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
        "energy": round(float(r[4]), 2) if r[4] else None,
        "valence": round(float(r[5]), 2) if r[5] else None,
        "tempo": round(float(r[6]), 1) if r[6] else None,
        "preview_url": r[7],
        "from_library": True,
        "already_saved": True,
        "spotify_id": r[0],
        "spotify_url": f"https://open.spotify.com/track/{r[0]}",
    } for r in cur.fetchall()]

def call_reccobeats(seeds, features, size=20):
    if not seeds:
        return []
    params = [("size", min(size * 3, 80))]  # fetch more so we can filter
    for seed in seeds[:5]:
        params.append(("seeds", seed))
    for key in ["energy", "valence", "danceability", "acousticness"]:
        if features.get(key) is not None:
            params.append((key, round(float(features[key]), 3)))
    params.append(("featureWeight", 4.0))
    params.append(("popularity", 55))  # minimum popularity — no obscure garbage

    try:
        resp = requests.get(f"{RECCOBEATS_BASE}/track/recommendation",
                           params=params, timeout=20)
        if resp.status_code == 200:
            return resp.json().get("content", [])
        return []
    except Exception as e:
        print(f"ReccoBeats error: {e}")
        return []

def is_likely_english(name: str, artist: str) -> bool:
    """
    Heuristic check for non-English tracks.
    Checks for non-Latin characters and known non-English patterns.
    """
    text = (name + " " + artist).lower()
    # Non-Latin scripts
    for char in text:
        if ord(char) > 1000:  # covers Cyrillic, Arabic, CJK, Devanagari etc
            return False
    # Known non-English genre keywords in artist/title
    blocked = ["cumbia", "reggaeton", "merengue", "kizomba", "afrobeats",
               "türkü", "chalga", "corrido", "banda", "nortena"]
    if any(b in text for b in blocked):
        return False
    return True

def format_rb_tracks(rb_tracks, library_ids, size, language_filter="en"):
    results = []
    for track in rb_tracks:
        if len(results) >= size:
            break

        href = track.get("href", "")
        spotify_id = None
        if "spotify.com/track/" in href:
            spotify_id = href.split("spotify.com/track/")[-1].split("?")[0]

        artists = track.get("artists") or []
        artist_str = ", ".join(a.get("name", "") for a in artists if isinstance(a, dict))
        name = track.get("trackTitle") or track.get("name") or ""
        popularity = track.get("popularity") or 0

        # Filter unpopular tracks
        if popularity < 45:
            continue

        # Language filter
        if language_filter in ["en", "en+hi", "en+hi+bn"]:
            if not is_likely_english(name, artist_str):
                # Allow if it looks Hindi (Devanagari) when filter allows it
                if language_filter == "en":
                    continue

        results.append({
            "reccobeats_id": track.get("id"),
            "spotify_id": spotify_id,
            "name": name,
            "artist": artist_str,
            "spotify_url": f"https://open.spotify.com/track/{spotify_id}" if spotify_id else None,
            "already_saved": spotify_id in library_ids if spotify_id else False,
            "popularity": popularity,
            "from_library": False,
        })
    return results


@router.get("/for-me")
def get_recommendations(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    vibe: Optional[str] = Query(None, description="Plain English vibe description"),
    seed_song: Optional[str] = Query(None, description="Song name to base recommendations on"),
    artists: Optional[str] = Query(None, description="Comma-separated artist names to prioritize"),
    language: str = Query("en", description="en | en+hi | en+hi+bn | any"),
    min_tempo: Optional[float] = Query(None),
    max_tempo: Optional[float] = Query(None),
    min_energy: Optional[float] = Query(None),
    max_energy: Optional[float] = Query(None),
    min_valence: Optional[float] = Query(None),
    max_valence: Optional[float] = Query(None),
    size: int = Query(20, le=50),
):
    conn = get_conn()
    cur = conn.cursor()

    artist_list = [a.strip() for a in artists.split(",")] if artists else None

    # Build taste profiles
    hour_profile   = get_hour_profile(cur, user_id)
    recent_profile = get_recent_profile(cur, user_id, days=7)
    alltime        = get_alltime_profile(cur, user_id)
    artist_profile = get_artist_profile(cur, user_id, artist_list) if artist_list else None

    # Merge with weights — artist profile dominates if provided
    if artist_profile:
        merged = merge([
            (artist_profile,  0.5),
            (recent_profile,  0.25),
            (hour_profile,    0.15),
            (alltime,         0.1),
        ])
    else:
        merged = merge([
            (recent_profile, 0.5),
            (hour_profile,   0.3),
            (alltime,        0.2),
        ])
    if not merged:
        merged = alltime

    # Apply vibe override
    if vibe:
        vibe_features = parse_vibe(vibe)
        for k, v in vibe_features.items():
            merged[k] = v * 0.65 + merged.get(k, v) * 0.35

    # Apply manual overrides
    if min_tempo or max_tempo:
        t = merged.get("tempo", 120)
        if min_tempo: t = max(t, min_tempo)
        if max_tempo: t = min(t, max_tempo)
        merged["tempo"] = t
    if min_energy is not None: merged["energy"] = max(merged.get("energy",0.5), min_energy)
    if max_energy is not None: merged["energy"] = min(merged.get("energy",0.5), max_energy)
    if min_valence is not None: merged["valence"] = max(merged.get("valence",0.5), min_valence)
    if max_valence is not None: merged["valence"] = min(merged.get("valence",0.5), max_valence)

    # Get seeds
    seeds = get_seeds_from_library(cur, user_id, artist_list)

    if seed_song:
        cur.execute("""
            SELECT id FROM tracks
            WHERE LOWER(name) LIKE %s AND user_id = %s
              AND reccobeats_id IS NOT NULL LIMIT 1
        """, (f"%{seed_song.lower()}%", user_id))
        row = cur.fetchone()
        if row:
            seeds = [row[0]] + [s for s in seeds if s != row[0]][:4]

    # Get library matches (songs you already like that fit this vibe)
    library_matches = get_library_matches(cur, user_id, merged, artist_list, limit=3)

    # Get library IDs for dedup
    cur.execute("SELECT id FROM tracks WHERE user_id = %s", (user_id,))
    library_ids = {row[0] for row in cur.fetchall()}

    cur.close()
    conn.close()

    # Call ReccoBeats
    rb_tracks = call_reccobeats(seeds, merged, size)
    new_tracks = format_rb_tracks(rb_tracks, library_ids, size - len(library_matches), language)

    # Combine: library matches first, then new discoveries
    all_tracks = library_matches + new_tracks

    return {
        "context": {
            "time_of_day": get_time_context(),
            "hour": datetime.now().hour,
            "vibe_input": vibe,
            "seed_song": seed_song,
            "artists_filter": artist_list,
            "language_filter": language,
            "used_hour_data": hour_profile is not None,
            "used_recent_data": recent_profile is not None,
            "used_artist_profile": artist_profile is not None,
            "target_features": {
                "energy":       round(merged.get("energy", 0), 2),
                "valence":      round(merged.get("valence", 0), 2),
                "tempo":        round(merged.get("tempo", 0), 1),
                "danceability": round(merged.get("danceability", 0), 2),
                "acousticness": round(merged.get("acousticness", 0), 2),
            }
        },
        "library_matches": library_matches,
        "tracks": all_tracks
    }


@router.get("/similar-to")
def similar_to(
    track_name: str = Query(...),
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    size: int = Query(15)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, artist, energy, valence, tempo, danceability, acousticness
        FROM tracks WHERE LOWER(name) LIKE %s AND user_id = %s LIMIT 1
    """, (f"%{track_name.lower()}%", user_id))
    track = cur.fetchone()
    if not track:
        cur.close(); conn.close()
        return {"error": f"'{track_name}' not found in your library"}

    track_id, name, artist, energy, valence, tempo, dance, acoustic = track
    cur.execute("SELECT id FROM tracks WHERE user_id = %s", (user_id,))
    library_ids = {row[0] for row in cur.fetchall()}
    cur.close(); conn.close()

    features = {"energy": energy or 0.5, "valence": valence or 0.5,
                "danceability": dance or 0.5, "acousticness": acoustic or 0.3}
    rb_tracks = call_reccobeats([track_id], features, size)
    tracks = format_rb_tracks(rb_tracks, library_ids, size, "en")

    return {
        "seed": {"name": name, "artist": artist},
        "target_features": features,
        "tracks": tracks
    }


# ════════════════════════════ RECOMMENDATION ENGINE ════════════════════════════
# Seed 1–2 songs/albums (or just filters) → similar SONGS and ALBUMS, owned + new.
# Owned results ranked by normalized audio-feature distance (core/similarity);
# unowned songs via ReccoBeats; unowned albums blended (Last.fm similar-artist top
# albums ⊕ unowned-song albums via Deezer). Replaces the ad-hoc taste_score.

def _lastfm(method, **params):
    if not LASTFM_KEY:
        return {}
    try:
        r = requests.get(LASTFM_URL, params={"method": method, "api_key": LASTFM_KEY,
                                             "format": "json", **params}, timeout=6)
        return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}

def _feats(e, v, t, d, a):
    return {"energy": e, "valence": v, "tempo": t, "danceability": d, "acousticness": a}

def _rb_album_profile(album_name, artist_name):
    """Avg audio features + member Spotify ids for an UNOWNED album via ReccoBeats."""
    try:
        sr = requests.get(f"{RECCOBEATS_BASE}/album/search",
                          params={"searchText": album_name, "size": 8}, timeout=15)
        albums = sr.json().get("content", []) if sr.status_code == 200 else []
    except Exception:
        albums = []
    if artist_name:
        albums = [a for a in albums if artist_name.lower() in str(a).lower()] or albums
    if not albums:
        return None, []
    aid = albums[0].get("id")
    try:
        tr = requests.get(f"{RECCOBEATS_BASE}/album/{aid}/track", params={"size": 40}, timeout=12)
        tracks = tr.json().get("content", []) if tr.status_code == 200 else []
    except Exception:
        tracks = []
    tids = [t.get("id") for t in tracks if t.get("id")]
    sids, fts = [], []
    for i in range(0, len(tids), 40):
        try:
            params = [("ids", x) for x in tids[i:i + 40]]
            fr = requests.get(f"{RECCOBEATS_BASE}/track", params=params, timeout=12)
            for t in (fr.json().get("content", []) if fr.status_code == 200 else []):
                fts.append(_feats(t.get("energy"), t.get("valence"), t.get("tempo"),
                                  t.get("danceability"), t.get("acousticness")))
                href = t.get("href", "")
                if "spotify.com/track/" in href:
                    sids.append(href.split("track/")[-1].split("?")[0])
        except Exception:
            pass
    return (similarity.merge_features(fts) if fts else None), sids

def _resolve_seed(cur, user_id, seed):
    """'song|Name|Artist' or 'album|Name|Artist' → seed context."""
    parts = (seed or "").split("|")
    typ = (parts[0].strip().lower() if parts else "song") or "song"
    name = parts[1].strip() if len(parts) > 1 else ""
    artist = parts[2].strip() if len(parts) > 2 else ""
    if not name:
        return None
    ctx = {"type": typ, "label": name, "artist": artist,
           "features": None, "spotify_ids": [], "artists": [], "album": None}
    if typ == "album":
        cur.execute(f"""SELECT AVG(energy),AVG(valence),AVG(tempo),AVG(danceability),AVG(acousticness),
                        COUNT(*), MAX(artist),
                        array_agg(id) FILTER (WHERE reccobeats_id IS NOT NULL)
                        FROM tracks WHERE user_id=%s AND LOWER(album) LIKE %s AND energy IS NOT NULL""",
                    (user_id, f"%{name.lower()}%"))
        r = cur.fetchone()
        if r and r[5]:
            ctx["features"] = _feats(*[float(x) if x is not None else None for x in r[:5]])
            ctx["artist"] = artist or r[6]
            ctx["album"] = name
            ctx["spotify_ids"] = (r[7] or [])[:5]
            ctx["artists"] = [ctx["artist"]] if ctx["artist"] else []
            return ctx
        feats, sids = _rb_album_profile(name, artist)   # unowned album
        ctx["features"], ctx["spotify_ids"], ctx["album"] = feats, sids[:5], name
        ctx["artists"] = [artist] if artist else []
        return ctx
    # song
    clauses, p = ["user_id=%s", "energy IS NOT NULL", "LOWER(name) LIKE %s"], [user_id, f"%{name.lower()}%"]
    if artist:
        clauses.append("LOWER(artist) LIKE %s"); p.append(f"%{artist.lower()}%")
    cur.execute(f"SELECT id, artist, {FEAT_COLS} FROM tracks WHERE {' AND '.join(clauses)} LIMIT 1", p)
    r = cur.fetchone()
    if r:
        ctx["features"] = _feats(*[float(x) if x is not None else None for x in r[2:7]])
        ctx["spotify_ids"] = [r[0]]; ctx["artist"] = r[1]; ctx["artists"] = [r[1]]
    else:
        ctx["artists"] = [artist] if artist else []
    return ctx

def _owned_song_recs(cur, user_id, target, stats, exclude_ids, size=10, lang=None, mood_sql=None):
    tv = similarity.to_vector(target, stats)
    e, v, t = target.get("energy", 0.5), target.get("valence", 0.5), target.get("tempo", 120)
    params = [user_id]
    excl = ""
    if exclude_ids:
        excl = " AND NOT (id = ANY(%s))"; params.append(list(exclude_ids))
    extra = ""
    if lang:
        extra += " AND LOWER(language) = %s"; params.append(lang.lower())
    if mood_sql:
        extra += f" AND ({mood_sql})"   # trusted literal from MOODS
    params += [e, v, t]
    cur.execute(f"""
        SELECT id,name,artist,album,release_year,language,preview_url,{FEAT_COLS}, instrumentalness
        FROM tracks WHERE user_id=%s AND energy IS NOT NULL{excl}{extra}
        ORDER BY (ABS(energy-%s)*1.3 + ABS(valence-%s)*1.3 + ABS(tempo-%s)/120.0*0.8) ASC
        LIMIT 60
    """, params)
    rows = cur.fetchall()
    out = []
    for r in rows:
        feat = _feats(*[float(x) if x is not None else None for x in r[7:12]])
        inst = float(r[12]) if r[12] is not None else None
        sc = similarity.score(tv, similarity.to_vector(feat, stats))
        out.append({
            "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
            "release_year": r[4], "language": r[5], "preview_url": r[6],
            "energy": round(feat["energy"], 2) if feat["energy"] is not None else None,
            "valence": round(feat["valence"], 2) if feat["valence"] is not None else None,
            "tempo": round(feat["tempo"], 1) if feat["tempo"] is not None else None,
            "moods": compute_moods(feat["valence"], feat["energy"], feat["tempo"],
                                   feat["acousticness"], feat["danceability"], inst),
            "match": sc, "already_saved": True,
            "spotify_url": f"https://open.spotify.com/track/{r[0]}",
        })
    out.sort(key=lambda x: x["match"], reverse=True)
    return out[:size]

def _owned_album_recs(cur, user_id, target, stats, exclude_album, size=2):
    cur.execute(f"""SELECT album,artist,COUNT(*),AVG(energy),AVG(valence),AVG(tempo),
                    AVG(danceability),AVG(acousticness)
                    FROM tracks WHERE user_id=%s AND album IS NOT NULL AND album!='' AND energy IS NOT NULL
                    GROUP BY album,artist HAVING COUNT(*)>=2""", (user_id,))
    tv = similarity.to_vector(target, stats)
    scored = []
    for album, artist, cnt, e, v, t, d, a in cur.fetchall():
        if exclude_album and album.lower() == exclude_album.lower():
            continue
        sc = similarity.score(tv, similarity.to_vector(_feats(float(e), float(v), float(t), float(d), float(a)), stats))
        scored.append((sc, album, artist, cnt))
    scored.sort(reverse=True)
    out = []
    for sc, album, artist, cnt in scored[:size]:
        cov = fetch_album_cover(album, artist)
        out.append({"album": album, "artist": artist, "owned": cnt,
                    "total_tracks": cov.get("nb_tracks"), "cover": cov.get("cover"),
                    "match": round(sc, 3), "already_saved": True})
    return out

def _deezer_track_album(name, artist):
    try:
        r = requests.get("https://api.deezer.com/search",
                         params={"q": f"{artist} {name}", "limit": 1}, timeout=6)
        d = r.json().get("data", [])
        if d:
            al = d[0].get("album") or {}
            return al.get("title"), (al.get("cover_medium") or al.get("cover")), d[0].get("artist", {}).get("name")
    except Exception:
        pass
    return None, None, None

def _unowned_album_recs(seed_artists, unowned_songs, owned_artists, owned_albums, size=3):
    cands = {}   # (album_lower, artist_lower) -> dict
    # Source A — similar artists → their top album (audio-similarity isn't available
    # for albums, so this is artist-driven, filtered to artists you don't own).
    for a in [x for x in seed_artists if x][:2]:
        for sim in _lastfm("artist.getSimilar", artist=a, limit=8).get("similarartists", {}).get("artist", [])[:8]:
            nm = sim.get("name")
            if not nm or nm.lower() in owned_artists:
                continue
            for al in _lastfm("artist.getTopAlbums", artist=nm, limit=1).get("topalbums", {}).get("album", [])[:1]:
                an = al.get("name")
                if not an or an.lower() in ("(null)", "null", ""):
                    continue
                key = (an.lower(), nm.lower())
                if key in owned_albums or key in cands:
                    continue
                cands[key] = {"album": an, "artist": nm, "why": f"similar to {a}",
                              "score": float(sim.get("match", 0) or 0), "cover": None}
    # Source B — albums behind your top unowned song recs (Deezer).
    for s in unowned_songs[:4]:
        if s.get("already_saved"):
            continue
        title, cover, dz_artist = _deezer_track_album(s.get("name", ""), s.get("artist", ""))
        if not title:
            continue
        art = dz_artist or s.get("artist", "")
        key = (title.lower(), art.lower())
        if art.lower() in owned_artists or key in owned_albums:
            continue
        if key in cands:
            cands[key]["cover"] = cands[key]["cover"] or cover
            cands[key]["score"] += 0.4
        else:
            cands[key] = {"album": title, "artist": art, "why": f"from “{s.get('name')}”",
                          "score": 0.5, "cover": cover}
    ranked = sorted(cands.values(), key=lambda x: x["score"], reverse=True)[:size]
    for c in ranked:
        if not c.get("cover"):
            c["cover"] = fetch_album_cover(c["album"], c["artist"]).get("cover")
        c.pop("score", None)
        c["already_saved"] = False
    return ranked


_REC_CACHE = {}   # signature -> (timestamp, payload)
_REC_TTL = 1800


@router.get("/recommend")
def recommend(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    seed: Optional[List[str]] = Query(None, description="up to 2: 'song|Name|Artist' or 'album|Name|Artist'"),
    vibe: Optional[str] = Query(None),
    artists: Optional[str] = Query(None),
    language: str = Query("en"),
    min_tempo: Optional[float] = Query(None), max_tempo: Optional[float] = Query(None),
    min_energy: Optional[float] = Query(None), max_energy: Optional[float] = Query(None),
    min_valence: Optional[float] = Query(None), max_valence: Optional[float] = Query(None),
    lat: Optional[float] = Query(None), lon: Optional[float] = Query(None),
    lang: Optional[str] = Query(None), mood: Optional[str] = Query(None),
    size: int = Query(10, le=20),
):
    sig = f"{user_id}|{sorted(seed or [])}|{vibe}|{artists}|{language}|{lang}|{mood}|{min_tempo}|{max_tempo}|{min_energy}|{max_energy}|{min_valence}|{max_valence}|{lat}|{lon}|{size}"
    hit = _REC_CACHE.get(sig)
    if hit and (_time.time() - hit[0] < _REC_TTL):
        return {**hit[1], "cached": True}

    conn = get_conn(); cur = conn.cursor()
    stats = similarity.library_feature_stats(cur, user_id)
    cur.execute("SELECT id FROM tracks WHERE user_id=%s", (user_id,))
    library_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT DISTINCT LOWER(artist) FROM tracks WHERE user_id=%s", (user_id,))
    owned_artists = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT DISTINCT LOWER(album), LOWER(artist) FROM tracks WHERE user_id=%s AND album!=''", (user_id,))
    owned_albums = {(r[0], r[1]) for r in cur.fetchall()}

    seeds_ctx = [c for c in (_resolve_seed(cur, user_id, s) for s in (seed or [])[:2]) if c]
    feat_seeds = [c["features"] for c in seeds_ctx if c["features"]]
    seed_ids = [sid for c in seeds_ctx for sid in c["spotify_ids"]][:5]
    seed_artists = [c["artist"] for c in seeds_ctx if c.get("artist")]
    exclude_album = next((c["album"] for c in seeds_ctx if c.get("album")), None)

    if feat_seeds:
        target = similarity.merge_features(feat_seeds)
    else:
        target = get_alltime_profile(cur, user_id)
        if artists:
            ap = get_artist_profile(cur, user_id, [a.strip() for a in artists.split(",")])
            if ap:
                target = ap
            seed_artists += [a.strip() for a in artists.split(",")]
        if vibe:
            for k, val in parse_vibe(vibe).items():
                target[k] = val * 0.65 + target.get(k, val) * 0.35
    # manual clamps
    if min_tempo: target["tempo"] = max(target.get("tempo", 120), min_tempo)
    if max_tempo: target["tempo"] = min(target.get("tempo", 120), max_tempo)
    if min_energy is not None: target["energy"] = max(target.get("energy", 0.5), min_energy)
    if max_energy is not None: target["energy"] = min(target.get("energy", 0.5), max_energy)
    if min_valence is not None: target["valence"] = max(target.get("valence", 0.5), min_valence)
    if max_valence is not None: target["valence"] = min(target.get("valence", 0.5), max_valence)

    # Weather as a filter — nudges the target toward the current sky.
    weather = None
    if lat is not None and lon is not None:
        from api.routes.search import weather_profile
        wp = weather_profile(lat, lon)
        if "error" not in wp:
            weather = {"explanation": wp["explanation"], "temperature": wp["temperature"]}
            wf = wp["filters"]
            if "min_energy" in wf:       target["energy"] = max(target.get("energy", 0.5), wf["min_energy"])
            if "max_energy" in wf:       target["energy"] = min(target.get("energy", 0.5), wf["max_energy"])
            if "min_valence" in wf:      target["valence"] = max(target.get("valence", 0.5), wf["min_valence"])
            if "max_valence" in wf:      target["valence"] = min(target.get("valence", 0.5), wf["max_valence"])
            if "min_acousticness" in wf: target["acousticness"] = max(target.get("acousticness", 0.3), wf["min_acousticness"])

    if not seed_ids:
        seed_ids = get_seeds_from_library(cur, user_id,
                                          [a.strip() for a in artists.split(",")] if artists else None)

    mood_sql = next((sql for k, _l, sql in MOODS if k == mood), None) if mood else None
    owned_songs = _owned_song_recs(cur, user_id, target, stats, set(seed_ids), size, lang=lang, mood_sql=mood_sql)
    owned_albums_out = _owned_album_recs(cur, user_id, target, stats, exclude_album, size=2)
    cur.close(); conn.close()

    rb = call_reccobeats(seed_ids, target, size)
    unowned_songs = format_rb_tracks(rb, library_ids, size, language)
    unowned_albums = _unowned_album_recs(seed_artists, unowned_songs, owned_artists, owned_albums, size=3)

    payload = {
        "seeds": [{"type": c["type"], "label": c["label"], "artist": c.get("artist"),
                   "resolved": c["features"] is not None} for c in seeds_ctx],
        "target_features": {k: round(target.get(k, 0), 3) for k in similarity.FEATURES},
        "weather": weather,
        "songs": {"owned": owned_songs, "unowned": unowned_songs},
        "albums": {"owned": owned_albums_out, "unowned": unowned_albums},
    }
    _REC_CACHE[sig] = (_time.time(), payload)
    return payload


@router.get("/rabbit-hole-tracks")
def rabbit_hole_tracks(artist: str, user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    """Your OWN tracks by a binged artist, ranked by plays then taste-fit — the ones
    to actually play next. Per-artist distinct (replaces the generic, repetitive
    Last.fm top-tracks that gave every card the same songs)."""
    conn = get_conn(); cur = conn.cursor()
    stats = similarity.library_feature_stats(cur, user_id)
    avg = {f: stats[f][0] for f in similarity.FEATURES}
    tv = similarity.to_vector(avg, stats)
    cur.execute(f"""
        SELECT t.id, t.name, COUNT(lh.id) AS plays, {", ".join("t."+c.strip() for c in FEAT_COLS.split(","))}, t.instrumentalness
        FROM tracks t LEFT JOIN listening_history lh ON lh.track_id = t.id
        WHERE t.user_id=%s AND LOWER(t.artist)=LOWER(%s)
        GROUP BY t.id, t.name, t.energy, t.valence, t.tempo, t.danceability, t.acousticness, t.instrumentalness
    """, (user_id, artist))
    rows = cur.fetchall()
    cur.close(); conn.close()
    out = []
    for r in rows:
        feat = _feats(*[float(x) if x is not None else None for x in r[3:8]])
        inst = float(r[8]) if r[8] is not None else None
        out.append({
            "id": r[0], "name": r[1], "artist": artist, "plays": r[2],
            "energy": round(feat["energy"], 2) if feat["energy"] is not None else None,
            "valence": round(feat["valence"], 2) if feat["valence"] is not None else None,
            "tempo": round(feat["tempo"], 1) if feat["tempo"] is not None else None,
            "moods": compute_moods(feat["valence"], feat["energy"], feat["tempo"],
                                   feat["acousticness"], feat["danceability"], inst),
            "taste": similarity.score(tv, similarity.to_vector(feat, stats)),
            "spotify_url": f"https://open.spotify.com/track/{r[0]}", "owned": True,
        })
    # most-played first; taste-fit breaks ties (and orders the never-polled ones)
    out.sort(key=lambda x: (x["plays"], x["taste"]), reverse=True)
    return {"artist": artist, "tracks": out[:6]}


# ── Harmonic matching ("Mixes well with") ──────────────────────────────────────
# Camelot wheel from track_key (pitch class 0..11) + mode (1 major / 0 minor).
_CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]   # B side
_CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]   # A side

def _camelot(key, mode):
    if key is None or key < 0 or key > 11:
        return None
    n = (_CAMELOT_MAJOR if mode == 1 else _CAMELOT_MINOR)[key]
    return (n, "B" if mode == 1 else "A")

def _relation(a, b):
    """How a (seed) mixes into b. Lower = smoother. None = clash."""
    if not a or not b:
        return None
    (na, la), (nb, lb) = a, b
    if na == nb and la == lb: return (0, "same key")
    if na == nb: return (1, "energy shift")               # relative major/minor
    if la == lb and (abs(na - nb) == 1 or abs(na - nb) == 11): return (2, "adjacent")
    return None

@router.get("/mixes-with")
def mixes_with(track: str, user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"), size: int = Query(8, le=20)):
    """Owned tracks that transition smoothly from `track` — harmonic (Camelot) key
    compatibility + close BPM. For album/flow listeners."""
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""SELECT id,name,artist,tempo,track_key,mode FROM tracks
                   WHERE user_id=%s AND LOWER(name) LIKE %s AND track_key IS NOT NULL AND tempo IS NOT NULL
                   ORDER BY saved_at DESC LIMIT 1""", (user_id, f"%{track.lower()}%"))
    seed = cur.fetchone()
    if not seed:
        cur.close(); conn.close()
        return {"error": f"'{track}' not found (or no key data)", "tracks": []}
    sid, sname, sartist, stempo, skey, smode = seed
    scam = _camelot(skey, smode)
    lo, hi = stempo * 0.94, stempo * 1.06
    cur.execute("""SELECT id,name,artist,tempo,track_key,mode FROM tracks
                   WHERE user_id=%s AND track_key IS NOT NULL AND tempo BETWEEN %s AND %s AND id<>%s""",
                (user_id, lo, hi, sid))
    rows = cur.fetchall()
    cur.close(); conn.close()
    out = []
    for tid, name, artist, tempo, key, mode in rows:
        rel = _relation(scam, _camelot(key, mode))
        if not rel:
            continue
        out.append({"id": tid, "name": name, "artist": artist, "tempo": round(float(tempo), 1),
                    "relation": rel[1], "bpm_diff": round(abs(float(tempo) - float(stempo)), 1),
                    "spotify_url": f"https://open.spotify.com/track/{tid}",
                    "_pri": rel[0]})
    out.sort(key=lambda x: (x["_pri"], x["bpm_diff"]))
    for o in out:
        o.pop("_pri", None)
    cam = f"{scam[0]}{scam[1]}" if scam else None
    return {"seed": {"name": sname, "artist": sartist, "tempo": round(float(stempo), 1), "camelot": cam},
            "tracks": out[:size]}