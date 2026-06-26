from fastapi import APIRouter, Query, Depends
import psycopg2, requests, os, time, re
from api.deps import get_current_user
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
    user_id:     str = Depends(get_current_user)
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

    # Tracks from this album already in your library — pull their REAL audio features too, so
    # per-track taste scores are accurate. ReccoBeats often returns album tracks with NO features
    # (energy/valence all null → every score collapses to the same default), so we prefer ours.
    cur.execute("""
        SELECT id, name, energy, valence, tempo, danceability, acousticness FROM tracks
        WHERE user_id = %s AND LOWER(album) LIKE %s
    """, (user_id, f"%{album_name.lower()}%"))
    owned_rows = cur.fetchall()
    owned = {r[1].lower(): r[0] for r in owned_rows}
    def _f(x): return float(x) if x is not None else None
    owned_feats = {
        r[1].lower(): {"energy": _f(r[2]), "valence": _f(r[3]), "tempo": _f(r[4]),
                       "danceability": _f(r[5]), "acousticness": _f(r[6])}
        for r in owned_rows if r[2] is not None
    }

    # All your library track IDs
    cur.execute("SELECT id FROM tracks WHERE user_id = %s", (user_id,))
    library_ids = {r[0] for r in cur.fetchall()}

    cur.close()
    conn.close()

    def taste_score(feat):
        if not feat:
            return 0
        s  = max(0, 1 - abs((feat.get("energy")       or 0.5) - taste["energy"])       * 2)
        s += max(0, 1 - abs((feat.get("valence")       or 0.5) - taste["valence"])      * 2)
        s += max(0, 1 - abs(((feat.get("tempo")        or 120) - taste["tempo"])        / 60))
        s += max(0, 1 - abs((feat.get("danceability")  or 0.5) - taste["danceability"]) * 2)
        s += max(0, 1 - abs((feat.get("acousticness")  or 0.3) - taste["acousticness"]) * 2)
        return round(s / 5, 3)

    def _artist_match(a):
        """Does this ReccoBeats album actually belong to the requested artist?"""
        arts = " ".join(x.get("name", "") for x in (a.get("artists") or []) if isinstance(x, dict)).lower()
        an = artist_name.lower().strip()
        if not arts or not an:
            return False
        if an in arts or arts in an:
            return True
        words = {w for w in an.split() if len(w) > 2}
        return bool(words) and all(w in arts for w in words)

    # Resolve the album on ReccoBeats by NAME, then STRICTLY verify the artist. The name search
    # returns many same-titled knock-off covers by random artists, so we NEVER fall back to a
    # random match — if nothing verifies, we build the list from YOUR library below (always the
    # correct album, with real features).
    rb_album, tracks_data = None, []
    try:
        sr = requests.get(f"{RECCOBEATS_BASE}/album/search",
                          params={"searchText": album_name, "size": 20}, timeout=20)
        cand = sr.json().get("content", []) if sr.status_code == 200 else []
        aml = album_name.lower()
        verified = [a for a in cand if _artist_match(a)]
        named = [a for a in verified if aml in a.get("name", "").lower() or a.get("name", "").lower() in aml]
        rb_album = (named or verified or [None])[0]
    except Exception:
        rb_album = None

    if rb_album:
        try:
            tr = requests.get(f"{RECCOBEATS_BASE}/album/{rb_album.get('id')}/track",
                              params={"size": 50}, timeout=12)
            tracks_data = tr.json().get("content", []) if tr.status_code == 200 else []
        except Exception:
            tracks_data = []

    # Audio features for the ReccoBeats tracks (owned tracks use your DB features instead).
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

    # Build the scored track list — from ReccoBeats when the album verified, else from your library.
    track_list = []
    if tracks_data:
        for track in tracks_data:
            tid        = track.get("id")
            href       = track.get("href", "")
            spotify_id = href.split("spotify.com/track/")[-1].split("?")[0] if "spotify.com/track/" in href else None
            name       = track.get("trackTitle") or track.get("name") or ""
            artists    = track.get("artists") or []
            artist_str = ", ".join(a.get("name", "") for a in artists if isinstance(a, dict))
            # prefer your real library features for owned tracks (ReccoBeats often has none for these)
            feat       = owned_feats.get(name.lower()) or features_map.get(tid, {})
            score      = taste_score(feat)
            track_list.append({
                "id":               tid,
                "spotify_id":       spotify_id,
                "name":             name,
                "artist":           artist_str or artist_name,
                "spotify_url":      f"https://open.spotify.com/track/{spotify_id}" if spotify_id else None,
                "energy":           round(float(feat.get("energy")       or 0), 2) if feat else None,
                "valence":          round(float(feat.get("valence")       or 0), 2) if feat else None,
                "tempo":            round(float(feat.get("tempo")         or 0), 1) if feat else None,
                "taste_score":      score,
                "already_saved":    (spotify_id in library_ids if spotify_id else False) or (name.lower() in owned),
                "recommended_entry": score > 0.65,
            })
    else:
        # No trustworthy ReccoBeats match → use YOUR library's tracks for this album. Always the
        # correct album; real features; everything here is owned by definition.
        for r in owned_rows:
            tid_, name = r[0], r[1]
            feat = owned_feats.get(name.lower(), {})
            track_list.append({
                "id":               tid_,
                "spotify_id":       tid_,
                "name":             name,
                "artist":           artist_name,
                "spotify_url":      f"https://open.spotify.com/track/{tid_}",
                "energy":           round(feat["energy"], 2) if feat.get("energy") is not None else None,
                "valence":          round(feat["valence"], 2) if feat.get("valence") is not None else None,
                "tempo":            round(feat["tempo"], 1)  if feat.get("tempo")  is not None else None,
                "taste_score":      taste_score(feat),
                "already_saved":    True,
                "recommended_entry": False,
            })

    if not track_list:
        return {"found": False, "message": f"Couldn't find '{album_name}' by {artist_name}."}

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
            "name":        (rb_album.get("name") if rb_album else None) or album_name,
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


_BS_CACHE = {}   # user_id -> (timestamp, blind_spots)
_BS_TTL = 3600


@router.get("/blind-spots")
def get_blind_spots(user_id: str = Depends(get_current_user)):
    """All blind-spot genres (cheap fields) + 3 example songs each. Cached 1h since
    the Last.fm tag aggregation is slow. Meaning + artist recs are lazy, per-card,
    from /blind-spot-detail."""
    if not LASTFM_KEY:
        return {"error": "Last.fm API key not configured"}

    cached = _BS_CACHE.get(user_id)
    if cached and (time.time() - cached[0] < _BS_TTL):
        return {"blind_spots": cached[1], "total_found": len(cached[1]), "cached": True}

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""SELECT artist, COUNT(*) FROM tracks WHERE user_id = %s
                   GROUP BY artist ORDER BY COUNT(*) DESC LIMIT 50""", (user_id,))
    top_artists = cur.fetchall()

    tag_counts, tag_artists = {}, {}
    SKIP_TAGS = {"seen live", "albums i own", "favorites", "love", "awesome",
                 "favorite", "under 2000 listeners", "spotify", "all"}
    for artist, song_count in top_artists:
        try:
            resp = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "artist.getTopTags", "artist": artist,
                "api_key": LASTFM_KEY, "format": "json"}, timeout=5)
            for tag in resp.json().get("toptags", {}).get("tag", [])[:8]:
                name = tag["name"].lower()
                if name in SKIP_TAGS:
                    continue
                tag_counts[name] = tag_counts.get(name, 0) + song_count
                tag_artists.setdefault(name, [])
                if artist not in tag_artists[name]:
                    tag_artists[name].append(artist)
        except Exception:
            continue

    blind_spots = []
    used = set()   # de-dupe songs across cards so genres sharing artists don't repeat
    for tag, count in tag_counts.items():
        ac = len(tag_artists[tag])
        if 1 <= ac <= 5 and count < 50:
            songs = []
            try:
                cur.execute("""SELECT name, artist FROM tracks
                               WHERE user_id = %s AND artist = ANY(%s)
                               ORDER BY saved_at DESC LIMIT 20""", (user_id, tag_artists[tag]))
                for n, a in cur.fetchall():
                    key = (n or "").lower()
                    if key in used:
                        continue
                    used.add(key)
                    songs.append({"name": n, "artist": a})
                    if len(songs) >= 3:
                        break
            except Exception:
                songs = []
            blind_spots.append({
                "genre": tag, "artists_you_have": tag_artists[tag],
                "artist_count": ac, "songs_in_library": count, "songs": songs,
            })
    cur.close(); conn.close()

    # Spread across the saved-count range so cards aren't all big niches — mix
    # small ~5-song footholds with the ~40-song ones (quantile-interleaved).
    bs_sorted = sorted(blind_spots, key=lambda x: x["songs_in_library"])
    n = len(bs_sorted) or 1
    B = 5
    buckets = [[] for _ in range(B)]
    for i, x in enumerate(bs_sorted):
        buckets[min(B - 1, i * B // n)].append(x)
    blind_spots = []
    for j in range(max((len(b) for b in buckets), default=0)):
        for b in buckets:
            if j < len(b):
                blind_spots.append(b[j])

    _BS_CACHE[user_id] = (time.time(), blind_spots)
    return {"blind_spots": blind_spots, "total_found": len(blind_spots)}


@router.get("/blind-spot-detail")
def blind_spot_detail(
    genre: str,
    artists: str = "",
    user_id: str = Depends(get_current_user),
):
    """One-sentence meaning of a genre + niche artists (similar to YOUR artists in
    that genre) you don't already own — accurate next-step recommendations."""
    meaning = None
    if LASTFM_KEY:
        try:
            r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "tag.getInfo", "tag": genre,
                "api_key": LASTFM_KEY, "format": "json"}, timeout=6)
            summary = r.json().get("tag", {}).get("wiki", {}).get("summary", "") or ""
            summary = re.sub(r"<.*?>", "", summary).split("Read more")[0].strip()
            if summary:
                first = summary.split(". ")[0].strip().rstrip(".")
                meaning = (first + ".") if first else None
        except Exception:
            pass

    seed = [a.strip() for a in artists.split(",") if a.strip()][:2]
    recs = {}
    if LASTFM_KEY:
        # Genre-representative artists — distinct PER genre, so different blind spots
        # don't all surface the same recommendations (the core fix).
        try:
            r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "tag.getTopArtists", "tag": genre, "limit": 30,
                "api_key": LASTFM_KEY, "format": "json"}, timeout=6)
            for i, ta in enumerate(r.json().get("topartists", {}).get("artist", [])):
                nm = ta.get("name")
                if nm:
                    recs[nm] = recs.get(nm, 0.0) + (1.0 - i / 30.0)
        except Exception:
            pass
        # Boost artists similar to the ones you already own in this genre (taste-fit).
        for a in seed:
            try:
                r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                    "method": "artist.getSimilar", "artist": a, "limit": 12,
                    "api_key": LASTFM_KEY, "format": "json"}, timeout=6)
                for sim in r.json().get("similarartists", {}).get("artist", []):
                    nm = sim.get("name")
                    if nm:
                        recs[nm] = recs.get(nm, 0.0) + 0.5 * float(sim.get("match", 0) or 0)
            except Exception:
                continue

    owned = set()
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("SELECT DISTINCT LOWER(artist) FROM tracks WHERE user_id = %s", (user_id,))
        owned = {row[0] for row in cur.fetchall()}
        cur.close(); conn.close()
    except Exception:
        pass

    ranked = sorted(((nm, sc) for nm, sc in recs.items() if nm.lower() not in owned),
                    key=lambda x: -x[1])
    rec_artists = [nm for nm, _ in ranked[:5]]

    # One representative track per top recommended artist (3 different artists) for
    # the flip-card back — the first is the "play next" pick (previewable on the UI).
    rec_tracks = []
    if LASTFM_KEY:
        for nm in rec_artists[:3]:
            try:
                r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                    "method": "artist.getTopTracks", "artist": nm, "limit": 1,
                    "api_key": LASTFM_KEY, "format": "json"}, timeout=5)
                tt = r.json().get("toptracks", {}).get("track", [])
                if isinstance(tt, dict):
                    tt = [tt]
                if tt and tt[0].get("name"):
                    rec_tracks.append({"artist": nm, "track": tt[0]["name"]})
            except Exception:
                continue

    return {"genre": genre, "meaning": meaning,
            "recommended_artists": rec_artists, "recommended_tracks": rec_tracks}


@router.get("/artist-top-tracks")
def artist_top_tracks(artist: str, user_id: str = Depends(get_current_user)):
    """An artist's best tracks (Last.fm) + whether you already own each — powers the
    rabbit-hole 'listen next' flip."""
    names = []
    if LASTFM_KEY:
        try:
            r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "artist.getTopTracks", "artist": artist, "limit": 8,
                "api_key": LASTFM_KEY, "format": "json"}, timeout=6)
            for t in r.json().get("toptracks", {}).get("track", []):
                if t.get("name"):
                    names.append(t["name"])
        except Exception:
            pass

    owned = set()
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("SELECT LOWER(name) FROM tracks WHERE user_id = %s AND LOWER(artist) = LOWER(%s)",
                    (user_id, artist))
        owned = {row[0] for row in cur.fetchall()}
        cur.close(); conn.close()
    except Exception:
        pass

    return {"artist": artist, "tracks": [{"name": n, "owned": n.lower() in owned} for n in names[:6]]}


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