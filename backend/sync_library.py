"""
sync_library.py — keep the saved-tracks library current.

Incremental: Spotify returns saved tracks newest-first, so we page until we hit
tracks already in the DB, then stop. New tracks get metadata + release year +
language (script detection) immediately, then audio features via ReccoBeats.

Run manually any time:           python backend/sync_library.py
Called automatically by the cron (run_poller.py) every run — so the library
stays current within the cron interval (well under 24h).
"""
import os, sys, time, requests, psycopg2
from datetime import datetime
from dotenv import load_dotenv

sys.path.append(os.path.dirname(__file__))   # so `core` imports work from anywhere
from core.spotify_client import get_spotify_client

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
RB = "https://api.reccobeats.com/v1"

# Unicode-script → language (matches the playlists setup)
SCRIPT_RANGES = [
    (0x0980, 0x09FF, "bengali"),   (0x0900, 0x097F, "hindi"),
    (0x0600, 0x06FF, "arabic"),    (0x0A00, 0x0A7F, "punjabi"),
    (0x0B80, 0x0BFF, "tamil"),     (0x0C00, 0x0C7F, "telugu"),
    (0x0C80, 0x0CFF, "kannada"),   (0x0D00, 0x0D7F, "malayalam"),
    (0xAC00, 0xD7AF, "korean"),    (0x4E00, 0x9FFF, "chinese"),
    (0x3040, 0x309F, "japanese"),  (0x0400, 0x04FF, "russian"),
]

def _detect_lang(text):
    for ch in (text or ""):
        code = ord(ch)
        for lo, hi, lang in SCRIPT_RANGES:
            if lo <= code <= hi:
                return lang
    return "english"

def _parse_year(release_date):
    try:
        return int(str(release_date)[:4]) if release_date else None
    except Exception:
        return None

def _enrich(cur, conn, spotify_ids):
    """Fill audio features for the given new tracks via ReccoBeats (2-step)."""
    for i in range(0, len(spotify_ids), 40):
        batch = spotify_ids[i:i+40]
        try:
            resp = requests.get(f"{RB}/track", params={"ids": ",".join(batch)}, timeout=15)
            rb_tracks = resp.json().get("content", []) if resp.status_code == 200 else []
        except Exception:
            rb_tracks = []
        rb_map = {}
        for rb in rb_tracks:
            href = rb.get("href", "")
            if "spotify.com/track/" in href:
                sid = href.split("spotify.com/track/")[-1].split("?")[0]
                rb_map[sid] = rb.get("id")
        for sid in batch:
            rbid = rb_map.get(sid)
            if not rbid:
                continue
            try:
                fr = requests.get(f"{RB}/track/{rbid}/audio-features", timeout=15)
                feat = fr.json() if fr.status_code == 200 else None
            except Exception:
                feat = None
            if not feat:
                continue
            cur.execute("""
                UPDATE tracks SET reccobeats_id=%s, tempo=%s, energy=%s, valence=%s,
                    danceability=%s, acousticness=%s, speechiness=%s, loudness=%s,
                    instrumentalness=%s, liveness=%s, track_key=%s, mode=%s
                WHERE id=%s
            """, (rbid, feat.get("tempo"), feat.get("energy"), feat.get("valence"),
                  feat.get("danceability"), feat.get("acousticness"), feat.get("speechiness"),
                  feat.get("loudness"), feat.get("instrumentalness"), feat.get("liveness"),
                  feat.get("key"), feat.get("mode"), sid))
        conn.commit()
        time.sleep(0.3)


def sync_saved_tracks(verbose=True):
    sp = get_spotify_client()
    user_id = sp.current_user()["id"]
    conn = psycopg2.connect(DB_URL); cur = conn.cursor()

    cur.execute("SELECT id FROM tracks WHERE user_id = %s", (user_id,))
    known = {r[0] for r in cur.fetchall()}

    offset, new_items = 0, []
    while True:
        res   = sp.current_user_saved_tracks(limit=50, offset=offset)
        items = res.get("items", [])
        if not items:
            break
        page_ids = [it["track"]["id"] for it in items
                    if it.get("track") and it["track"].get("id")]
        new_items += [it for it in items
                      if it.get("track") and it["track"].get("id")
                      and it["track"]["id"] not in known]
        # newest-first → once a whole page is already known, we're done
        if page_ids and all(pid in known for pid in page_ids):
            break
        offset += 50
        time.sleep(0.1)

    new_ids = []
    for it in new_items:
        t = it["track"]
        lang = _detect_lang(f"{t['name']} {t['artists'][0]['name']}")
        try:
            cur.execute("""
                INSERT INTO tracks (id, user_id, name, artist, album, saved_at,
                                    preview_url, release_year, language)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (t["id"], user_id, t["name"], t["artists"][0]["name"],
                  t["album"]["name"], it["added_at"], t.get("preview_url"),
                  _parse_year(t["album"].get("release_date")), lang))
            if cur.rowcount > 0:
                new_ids.append(t["id"])
        except Exception:
            pass
    conn.commit()

    if new_ids:
        _enrich(cur, conn, new_ids)

    cur.close(); conn.close()
    if verbose:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] library sync: "
              f"{len(new_ids)} new tracks added"
              + (" + enriched" if new_ids else ""))
    return len(new_ids)


if __name__ == "__main__":
    sync_saved_tracks()
