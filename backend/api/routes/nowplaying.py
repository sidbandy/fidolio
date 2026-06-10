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
    cache_path = os.path.join(
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


@router.get("/lyrics-meaning")
def get_lyrics_meaning(track_name: str, artist: str):
    """Get song meaning and annotations from Genius."""
    if not GENIUS_TOKEN:
        return {"error": "No Genius token configured"}

    headers = {"Authorization": f"Bearer {GENIUS_TOKEN}"}

    try:
        # Search for the song
        search_resp = requests.get(
            "https://api.genius.com/search",
            params={"q": f"{track_name} {artist}"},
            headers=headers,
            timeout=8
        )
        hits = search_resp.json().get("response", {}).get("hits", [])
        if not hits:
            return {"found": False, "message": "Song not found on Genius"}

        # Find best match by artist name
        song = None
        for hit in hits:
            result = hit.get("result", {})
            primary_artist = result.get("primary_artist", {}).get("name", "").lower()
            if artist.lower() in primary_artist or primary_artist in artist.lower():
                song = result
                break
        if not song:
            song = hits[0]["result"]

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