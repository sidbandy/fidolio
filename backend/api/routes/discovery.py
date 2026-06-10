from fastapi import APIRouter, Query
from typing import Optional
import psycopg2
import requests
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")
RECCOBEATS_BASE = "https://api.reccobeats.com/v1"

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