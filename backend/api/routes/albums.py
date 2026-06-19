from fastapi import APIRouter, Query
import psycopg2, requests, os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")
RECCOBEATS_BASE = "https://api.reccobeats.com/v1"
LASTFM_KEY = os.getenv("LASTFM_API_KEY")

def get_conn():
    return psycopg2.connect(DB_URL)


@router.get("/explore")
def explore_album(
    album_name:  str = Query(...),
    artist_name: str = Query(...),
    user_id:     str = Query("0tz6fep2m5bx1vq85g48518u9")
):
    conn = get_conn()
    cur  = conn.cursor()

    # Your taste profile
    cur.execute("""
        SELECT AVG(energy), AVG(valence), AVG(tempo),
               AVG(danceability), AVG(acousticness)
        FROM tracks WHERE user_id = %s AND energy IS NOT NULL
    """, (user_id,))
    row = cur.fetchone()
    taste = {
        "energy":       float(row[0] or 0.5),
        "valence":      float(row[1] or 0.5),
        "tempo":        float(row[2] or 120),
        "danceability": float(row[3] or 0.5),
        "acousticness": float(row[4] or 0.3),
    }

    # Tracks from this album already in your library
    cur.execute("""
        SELECT id, name FROM tracks
        WHERE user_id = %s AND LOWER(album) LIKE %s
    """, (user_id, f"%{album_name.lower()}%"))
    owned = {r[1].lower(): r[0] for r in cur.fetchall()}

    # All your library track IDs
    cur.execute("SELECT id FROM tracks WHERE user_id = %s", (user_id,))
    library_ids = {r[0] for r in cur.fetchall()}

    cur.close()
    conn.close()

    # Search ReccoBeats for the album
    try:
        search_resp = requests.get(
            f"{RECCOBEATS_BASE}/album/search",
            params={"searchText": album_name, "size": 10},
            timeout=25
        )
        if search_resp.status_code == 200:
            all_albums = search_resp.json().get("content", [])
            albums = [
                a for a in all_albums
                if artist_name.lower() in str(a).lower()
            ]
            if not albums:
                albums = all_albums
        else:
            albums = []
    except Exception as e:
        return {"found": False, "message": f"Search error: {e}"}

    if not albums:
        return {"found": False, "message": f"Album '{album_name}' by {artist_name} not found"}

    album    = albums[0]
    album_id = album.get("id")

    # Get album tracks
    try:
        tracks_resp = requests.get(
            f"{RECCOBEATS_BASE}/album/{album_id}/track",
            params={"size": 50},
            timeout=10
        )
        tracks_data = tracks_resp.json().get("content", []) if tracks_resp.status_code == 200 else []
    except Exception:
        tracks_data = []

    # Batch fetch audio features
    track_ids    = [t.get("id") for t in tracks_data if t.get("id")]
    features_map = {}
    for i in range(0, len(track_ids), 40):
        batch = track_ids[i:i+40]
        try:
            params    = [("ids", tid) for tid in batch]
            feat_resp = requests.get(f"{RECCOBEATS_BASE}/track", params=params, timeout=10)
            if feat_resp.status_code == 200:
                for t in feat_resp.json().get("content", []):
                    features_map[t["id"]] = t
        except Exception:
            pass

    def taste_score(feat):
        if not feat:
            return 0
        s  = max(0, 1 - abs((feat.get("energy")       or 0.5) - taste["energy"])       * 2)
        s += max(0, 1 - abs((feat.get("valence")       or 0.5) - taste["valence"])      * 2)
        s += max(0, 1 - abs(((feat.get("tempo")        or 120) - taste["tempo"])        / 60))
        s += max(0, 1 - abs((feat.get("danceability")  or 0.5) - taste["danceability"]) * 2)
        s += max(0, 1 - abs((feat.get("acousticness")  or 0.3) - taste["acousticness"]) * 2)
        return round(s / 5, 3)

    # Last.fm album tags
    album_tags = []
    if LASTFM_KEY:
        try:
            lfm = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method":  "album.getInfo",
                "artist":  artist_name,
                "album":   album_name,
                "api_key": LASTFM_KEY,
                "format":  "json"
            }, timeout=6)
            raw_tags   = lfm.json().get("album", {}).get("tags", {}).get("tag", [])
            album_tags = [t["name"] for t in raw_tags[:5]] if raw_tags else []
        except Exception:
            pass

    # Build scored track list
    track_list = []
    for track in tracks_data:
        tid        = track.get("id")
        feat       = features_map.get(tid, {})
        href       = track.get("href", "")
        spotify_id = href.split("spotify.com/track/")[-1].split("?")[0] if "spotify.com/track/" in href else None
        name       = track.get("trackTitle") or track.get("name") or ""
        artists    = track.get("artists") or []
        artist_str = ", ".join(a.get("name", "") for a in artists if isinstance(a, dict))
        score      = taste_score(feat)

        track_list.append({
            "id":               tid,
            "spotify_id":       spotify_id,
            "name":             name,
            "artist":           artist_str,
            "spotify_url":      f"https://open.spotify.com/track/{spotify_id}" if spotify_id else None,
            "energy":           round(float(feat.get("energy")       or 0), 2) if feat else None,
            "valence":          round(float(feat.get("valence")       or 0), 2) if feat else None,
            "tempo":            round(float(feat.get("tempo")         or 0), 1) if feat else None,
            "taste_score":      score,
            "already_saved":    (spotify_id in library_ids if spotify_id else False) or (name.lower() in owned),
            "recommended_entry": score > 0.65,
        })

    entry_points = sorted(
        [t for t in track_list if not t["already_saved"]],
        key=lambda x: x["taste_score"], reverse=True
    )[:3]

    energies      = [t["energy"]  for t in track_list if t["energy"]]
    valences      = [t["valence"] for t in track_list if t["valence"]]
    album_energy  = round(sum(energies) / len(energies), 2) if energies else None
    album_valence = round(sum(valences) / len(valences), 2) if valences else None

    return {
        "found": True,
        "album": {
            "name":        album.get("name") or album_name,
            "artist":      artist_name,
            "tags":        album_tags,
            "track_count": len(track_list),
            "avg_energy":  album_energy,
            "avg_valence": album_valence,
            "you_own":     len(owned),
        },
        "taste_comparison": {
            "your_energy":   taste["energy"],
            "album_energy":  album_energy,
            "your_valence":  taste["valence"],
            "album_valence": album_valence,
            "overall_fit":   round(sum(t["taste_score"] for t in track_list) / max(len(track_list), 1), 2)
        },
        "entry_points": entry_points,
        "tracks":        track_list,
    }


@router.get("/blind-spots")
def get_blind_spots(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    limit:   int = Query(10)
):
    if not LASTFM_KEY:
        return {"error": "Last.fm API key not configured"}

    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT artist, COUNT(*) as songs
        FROM tracks WHERE user_id = %s
        GROUP BY artist ORDER BY songs DESC LIMIT 50
    """, (user_id,))
    top_artists = cur.fetchall()
    cur.close()
    conn.close()

    tag_counts  = {}
    tag_artists = {}
    SKIP_TAGS   = {"seen live", "albums i own", "favorites", "love", "awesome",
                   "favorite", "under 2000 listeners", "spotify", "all"}

    for artist, song_count in top_artists:
        try:
            resp = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method":  "artist.getTopTags",
                "artist":  artist,
                "api_key": LASTFM_KEY,
                "format":  "json"
            }, timeout=5)
            tags = resp.json().get("toptags", {}).get("tag", [])
            for tag in tags[:8]:
                name = tag["name"].lower()
                if name in SKIP_TAGS:
                    continue
                tag_counts[name] = tag_counts.get(name, 0) + song_count
                if name not in tag_artists:
                    tag_artists[name] = []
                if artist not in tag_artists[name]:
                    tag_artists[name].append(artist)
        except Exception:
            continue

    blind_spots = []
    for tag, count in tag_counts.items():
        artist_count = len(tag_artists[tag])
        if 1 <= artist_count <= 5 and count < 50:
            blind_spots.append({
                "genre":           tag,
                "artists_you_have": tag_artists[tag],
                "songs_in_library": count,
            })

    blind_spots.sort(key=lambda x: x["songs_in_library"], reverse=True)
    top = blind_spots[:limit]

    # Enrich the surfaced blind spots: what the genre means + your songs in it.
    import re
    conn = get_conn(); cur = conn.cursor()
    for bs in top:
        # Plain-language meaning via Last.fm tag.getInfo
        try:
            r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "tag.getInfo", "tag": bs["genre"],
                "api_key": LASTFM_KEY, "format": "json",
            }, timeout=5)
            summary = r.json().get("tag", {}).get("wiki", {}).get("summary", "") or ""
            summary = re.sub(r"<.*?>", "", summary).split("Read more")[0].strip()
            bs["description"] = summary or None
        except Exception:
            bs["description"] = None
        # Example songs you own in this genre (by the artists tagged with it)
        try:
            cur.execute("""
                SELECT name, artist FROM tracks
                WHERE user_id = %s AND artist = ANY(%s)
                ORDER BY saved_at DESC LIMIT 12
            """, (user_id, bs["artists_you_have"]))
            bs["songs"] = [{"name": n, "artist": a} for n, a in cur.fetchall()]
        except Exception:
            bs["songs"] = []
        bs["artist_count"] = len(bs["artists_you_have"])
    cur.close(); conn.close()

    return {
        "blind_spots":  top,
        "total_found":  len(blind_spots),
        "message":      "Genres you've touched but never gone deep on"
    }


@router.get("/debug-lastfm")
def debug_lastfm(artist: str = Query("Mac Miller")):
    return {
        "key_loaded":   bool(LASTFM_KEY),
        "key_preview":  LASTFM_KEY[:6] + "..." if LASTFM_KEY else None,
        "test": requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method":  "artist.getTopTags",
            "artist":  artist,
            "api_key": LASTFM_KEY,
            "format":  "json"
        }, timeout=8).json() if LASTFM_KEY else None
    }