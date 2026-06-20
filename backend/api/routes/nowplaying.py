from fastapi import APIRouter
import psycopg2, requests, os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")
GENIUS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN")
LASTFM_KEY = os.getenv("LASTFM_API_KEY")

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

def get_spotify():
    cache_path = os.getenv("SPOTIFY_CACHE_PATH") or os.path.join(
        os.path.dirname(__file__), '..', '..', '..', '.cache'
    )
    auth = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE,
        open_browser=False,
        cache_path=os.path.abspath(cache_path)
    )
    return spotipy.Spotify(auth_manager=auth)

def get_conn():
    return psycopg2.connect(DB_URL)


@router.get("/current")
def get_current_track():
    """What's currently playing on your Spotify."""
    try:
        sp = get_spotify()
        current = sp.currently_playing()
        if not current or not current.get("item"):
            return {"playing": False}

        track = current["item"]
        track_id = track["id"]
        artist = track["artists"][0]["name"]
        name = track["name"]
        album = track["album"]["name"]
        album_art = track["album"]["images"][0]["url"] if track["album"]["images"] else None
        progress_ms = current.get("progress_ms", 0)
        duration_ms = track.get("duration_ms", 1)
        is_playing = current.get("is_playing", False)

        # Check if it's in your library and get audio features
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT energy, valence, tempo, danceability, acousticness
            FROM tracks WHERE id = %s
        """, (track_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        features = None
        if row and row[0]:
            features = {
                "energy":       round(float(row[0]), 2),
                "valence":      round(float(row[1]), 2),
                "tempo":        round(float(row[2]), 1),
                "danceability": round(float(row[3]), 2),
                "acousticness": round(float(row[4]), 2),
            }

        return {
            "playing":      is_playing,
            "track_id":     track_id,
            "name":         name,
            "artist":       artist,
            "album":        album,
            "album_art":    album_art,
            "progress_ms":  progress_ms,
            "duration_ms":  duration_ms,
            "progress_pct": round((progress_ms / duration_ms) * 100, 1),
            "spotify_url":  f"https://open.spotify.com/track/{track_id}",
            "in_library":   row is not None,
            "features":     features,
        }
    except Exception as e:
        return {"playing": False, "error": str(e)}


import re, difflib

def _norm(s: str) -> str:
    """Normalize a title/artist for comparison: strip parentheticals, features, punctuation."""
    s = (s or "").lower()
    s = re.sub(r"\(.*?\)", " ", s)          # (From "2 States"), (feat. ...)
    s = re.sub(r"\[.*?\]", " ", s)
    s = re.sub(r"\s*-\s*from\b.*$", " ", s)  # - From "Movie"
    s = re.sub(r"\b(feat|ft|with)\.?\b.*$", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)           # drop punctuation
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()

def _artist_matches(query_artist: str, hit_artist: str) -> bool:
    qa, ha = _norm(query_artist), _norm(hit_artist)
    if not qa or not ha:
        return False
    if qa in ha or ha in qa:
        return True
    qt = {w for w in qa.split() if len(w) > 2}
    ht = {w for w in ha.split() if len(w) > 2}
    return len(qt & ht) >= 1


@router.get("/lyrics-meaning")
def get_lyrics_meaning(track_name: str, artist: str):
    """Get song meaning and annotations from Genius — with strict match verification."""
    if not GENIUS_TOKEN:
        return {"error": "No Genius token configured"}

    headers = {"Authorization": f"Bearer {GENIUS_TOKEN}"}
    clean_title = _norm(track_name)

    try:
        # Search with the cleaned title + artist (parentheticals removed)
        search_resp = requests.get(
            "https://api.genius.com/search",
            params={"q": f"{clean_title} {artist}".strip()},
            headers=headers,
            timeout=8
        )
        hits = search_resp.json().get("response", {}).get("hits", [])
        if not hits:
            return {"found": False, "message": "Song not found on Genius"}

        # Score every hit by title similarity + artist match; keep the best.
        best, best_score = None, 0.0
        for hit in hits:
            result      = hit.get("result", {})
            hit_title   = _norm(result.get("title") or result.get("full_title") or "")
            hit_artist  = result.get("primary_artist", {}).get("name", "")
            title_sim   = _sim(clean_title, hit_title)
            amatch      = _artist_matches(artist, hit_artist)
            # title carries most of the weight; a matching artist is a strong boost
            score = title_sim + (0.45 if amatch else 0.0)
            if score > best_score:
                best_score, best = score, result

        # Refuse to show a wrong song. Require either a solid title match,
        # or a decent title match backed by the right artist.
        if not best or best_score < 0.65:
            return {"found": False, "message": "No confident match on Genius for this track"}

        song = best
        song_id = song["id"]
        song_url = song.get("url")
        annotation_count = song.get("annotation_count", 0)

        # Get full song data including description
        song_resp = requests.get(
            f"https://api.genius.com/songs/{song_id}",
            params={"text_format": "plain"},
            headers=headers,
            timeout=8
        )
        song_data = song_resp.json().get("response", {}).get("song", {})
        description = song_data.get("description", {}).get("plain", "")
        description_preview = None
        if description and description.strip() not in ("?", ""):
            description_preview = description[:600]

        return {
            "found":            True,
            "song_id":          song_id,
            "title":            song.get("full_title"),
            "genius_url":       song_url,
            "annotation_count": annotation_count,
            "description":      description_preview,
            "release_date":     song_data.get("release_date_for_display"),
            "pageviews":        song_data.get("stats", {}).get("pageviews"),
            "album":            song_data.get("album", {}).get("name") if song_data.get("album") else None,
        }
    except Exception as e:
        return {"found": False, "error": str(e)}


@router.get("/synced-lyrics")
def synced_lyrics(track: str, artist: str, duration: float = 0):
    """Time-synced lyrics from LRCLIB (free, no auth). Parsed into [{t, text}] so the
    Now Playing panel can scroll them line-by-line against the track's real position."""
    import re
    data = {}
    headers = {"User-Agent": "Fidolio (personal music analytics)"}
    try:
        params = {"track_name": track, "artist_name": artist}
        if duration:
            params["duration"] = int(duration)
        r = requests.get("https://lrclib.net/api/get", params=params, timeout=8, headers=headers)
        if r.status_code == 200:
            data = r.json()
        else:
            sr = requests.get("https://lrclib.net/api/search",
                              params={"track_name": track, "artist_name": artist},
                              timeout=8, headers=headers)
            arr = sr.json() if sr.status_code == 200 else []
            data = arr[0] if isinstance(arr, list) and arr else {}
    except Exception as e:
        return {"found": False, "error": str(e)}

    synced = data.get("syncedLyrics") or ""
    plain = data.get("plainLyrics") or ""
    lines = []
    for m in re.finditer(r"\[(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)", synced):
        mn, sec, cs, text = m.groups()
        frac = (int(cs) / (100 if len(cs) == 2 else 1000)) if cs else 0
        t = int(mn) * 60 + int(sec) + frac
        if text.strip():
            lines.append({"t": round(t, 2), "text": text.strip()})
    return {"found": bool(lines or plain), "synced": bool(lines),
            "lines": lines, "plain": "" if lines else plain[:2000]}


@router.get("/deezer-preview")
def get_deezer_preview(track_name: str, artist: str):
    """Get a 30-second Deezer preview URL for any track."""
    try:
        resp = requests.get(
            "https://api.deezer.com/search",
            params={"q": f"{artist} {track_name}", "limit": 10},
            timeout=8
        )
        results = resp.json().get("data", [])

        # Try to find exact match first
        for track in results:
            track_title  = track.get("title", "").lower()
            track_artist = track.get("artist", {}).get("name", "").lower()
            name_match   = track_name.lower() in track_title or track_title in track_name.lower()
            artist_match = artist.lower() in track_artist or track_artist in artist.lower()
            if name_match and artist_match and track.get("preview"):
                return {
                    "found":       True,
                    "preview_url": track["preview"],
                    "deezer_id":   track["id"],
                    "duration":    track.get("duration"),
                }

        # Fallback: return first result that has a preview
        for track in results:
            if track.get("preview"):
                return {
                    "found":             True,
                    "preview_url":       track["preview"],
                    "deezer_id":         track["id"],
                    "duration":          track.get("duration"),
                    "approximate_match": True,
                }

        return {"found": False}
    except Exception as e:
        return {"found": False, "error": str(e)}