from fastapi import APIRouter, Query, Depends
from api.deps import get_current_user, require_user
from typing import Literal
import psycopg2
import os
import time
from datetime import timedelta
from dotenv import load_dotenv
from api.routes.library import fetch_album_cover, MOODS

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)


@router.post("/refresh-listening")
def refresh_listening(user_id: str = Depends(require_user)):
    """
    Poll the logged-in user's last 50 plays right now and record new ones, so the live
    'today' stats update the moment the app opens (no hard reload needed).
    Cheap — one Spotify call + a few inserts. The hourly cron does the same.
    """
    try:
        from core.spotify_client import get_spotify_client
        sp = get_spotify_client(user_id)
        uid = user_id
        items = sp.current_user_recently_played(limit=50).get("items", [])
    except Exception as e:
        return {"success": False, "error": str(e)}

    conn = get_conn(); cur = conn.cursor()
    new = 0
    for it in items:
        t = it.get("track") or {}
        if not t.get("id"):
            continue
        try:
            cur.execute(
                """INSERT INTO listening_history (user_id, track_id, track_name, artist_name, played_at)
                   VALUES (%s,%s,%s,%s,%s) ON CONFLICT (user_id, played_at) DO NOTHING""",
                (uid, t["id"], t["name"], t["artists"][0]["name"], it["played_at"]),
            )
            if cur.rowcount > 0:
                new += 1
        except Exception:
            pass
    conn.commit(); cur.close(); conn.close()
    return {"success": True, "new_plays": new}


@router.get("/wrapped")
def get_wrapped(
    period: Literal["day", "week", "month", "year"] = "month",
    user_id: str = Depends(get_current_user)
):
    conn = get_conn()
    cur  = conn.cursor()
    interval_map = {
        "day": "1 day", "week": "7 days",
        "month": "30 days", "year": "365 days"
    }
    interval = interval_map[period]
    cur.execute("""
        SELECT artist_name, COUNT(*) as plays
        FROM listening_history
        WHERE user_id = %s AND played_at >= NOW() - INTERVAL %s
        GROUP BY artist_name ORDER BY plays DESC LIMIT 10
    """, (user_id, interval))
    top_artists = [{"artist": r[0], "plays": r[1]} for r in cur.fetchall()]
    cur.execute("""
        SELECT track_name, artist_name, COUNT(*) as plays
        FROM listening_history
        WHERE user_id = %s AND played_at >= NOW() - INTERVAL %s
        GROUP BY track_name, artist_name ORDER BY plays DESC LIMIT 10
    """, (user_id, interval))
    top_songs = [{"track": r[0], "artist": r[1], "plays": r[2]} for r in cur.fetchall()]
    cur.execute("""
        SELECT COUNT(*) * 3.5 FROM listening_history
        WHERE user_id = %s AND played_at >= NOW() - INTERVAL %s
    """, (user_id, interval))
    total_minutes = cur.fetchone()[0] or 0
    cur.execute("""
        SELECT EXTRACT(hour FROM played_at) as hour, COUNT(*) as plays
        FROM listening_history
        WHERE user_id = %s AND played_at >= NOW() - INTERVAL %s
        GROUP BY hour ORDER BY hour
    """, (user_id, interval))
    clock = {int(r[0]): r[1] for r in cur.fetchall()}
    listening_clock = [{"hour": h, "plays": clock.get(h, 0)} for h in range(24)]
    cur.close()
    conn.close()
    return {
        "period": period,
        "top_artists": top_artists,
        "top_songs": top_songs,
        "total_minutes": round(total_minutes),
        "listening_clock": listening_clock
    }

@router.get("/all-time")
def all_time_stats(user_id: str = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM listening_history WHERE user_id = %s", (user_id,))
    total_plays = cur.fetchone()[0]
    cur.execute("""
        SELECT artist_name, COUNT(*) as plays
        FROM listening_history
        WHERE user_id = %s
        GROUP BY artist_name ORDER BY plays DESC LIMIT 5
    """, (user_id,))
    top_artists = [{"artist": r[0], "plays": r[1]} for r in cur.fetchall()]
    cur.execute("SELECT MIN(played_at), MAX(played_at) FROM listening_history WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    first_play, last_play = row
    cur.close()
    conn.close()
    return {
        "total_plays": total_plays,
        "estimated_hours": round((total_plays * 3.5) / 60, 1),
        "top_artists_all_time": top_artists,
        "tracking_since": str(first_play)[:10] if first_play else None,
        "last_play": str(last_play)[:16] if last_play else None
    }

@router.get("/sonic-identity")
def sonic_identity(user_id: str = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            ROUND(AVG(tempo)::numeric, 1)         as avg_tempo,
            ROUND(AVG(energy)::numeric, 3)        as avg_energy,
            ROUND(AVG(valence)::numeric, 3)       as avg_valence,
            ROUND(AVG(danceability)::numeric, 3)  as avg_dance,
            ROUND(AVG(acousticness)::numeric, 3)  as avg_acoustic,
            ROUND(AVG(instrumentalness)::numeric, 3) as avg_instrumental,
            ROUND(AVG(speechiness)::numeric, 3)   as avg_speech,
            COUNT(*) as total_tracks
        FROM tracks WHERE tempo IS NOT NULL AND user_id = %s
    """, (user_id,))
    avg = cur.fetchone()
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE valence < 0.3)  as dark,
            COUNT(*) FILTER (WHERE valence BETWEEN 0.3 AND 0.6) as neutral,
            COUNT(*) FILTER (WHERE valence > 0.6)  as happy
        FROM tracks WHERE valence IS NOT NULL AND user_id = %s
    """, (user_id,))
    mood = cur.fetchone()
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE energy < 0.3)  as calm,
            COUNT(*) FILTER (WHERE energy BETWEEN 0.3 AND 0.6) as medium,
            COUNT(*) FILTER (WHERE energy > 0.6)  as intense
        FROM tracks WHERE energy IS NOT NULL AND user_id = %s
    """, (user_id,))
    energy_dist = cur.fetchone()
    cur.execute("""
        SELECT track_key, COUNT(*) as c
        FROM tracks WHERE track_key IS NOT NULL AND user_id = %s
        GROUP BY track_key ORDER BY c DESC LIMIT 1
    """, (user_id,))
    top_key_row = cur.fetchone()
    key_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    top_key = key_names[top_key_row[0]] if top_key_row and top_key_row[0] >= 0 else "Unknown"
    cur.execute("""
        SELECT artist, COUNT(*) as saves,
               MIN(saved_at) as first_save, MAX(saved_at) as last_save
        FROM tracks WHERE user_id = %s
        GROUP BY artist HAVING COUNT(*) >= 5
        ORDER BY (MAX(saved_at) - MIN(saved_at)) ASC
        LIMIT 30
    """, (user_id,))
    rabbit_holes = [{
        "artist": r[0], "songs_saved": r[1],
        "first_save": str(r[2])[:10], "last_save": str(r[3])[:10]
    } for r in cur.fetchall()]

    # Signature mood — the single most common niche mood across the library.
    sel = ", ".join(f"COUNT(*) FILTER (WHERE {sql})" for _k, _l, sql in MOODS)
    cur.execute(f"SELECT {sel} FROM tracks WHERE user_id = %s", (user_id,))
    counts = cur.fetchone() or []
    signature_mood = None
    if counts:
        top = max(zip(MOODS, counts), key=lambda x: x[1] or 0)
        signature_mood = top[0][1] if (top[1] or 0) > 0 else None   # label

    # Era — the release year you've saved the most from (peak of your taste).
    cur.execute("""SELECT release_year, COUNT(*) c FROM tracks
                   WHERE user_id = %s AND release_year IS NOT NULL
                   GROUP BY release_year ORDER BY c DESC LIMIT 1""", (user_id,))
    yr = cur.fetchone()
    peak_year = int(yr[0]) if yr and yr[0] else None
    peak_year_count = int(yr[1]) if yr and yr[0] else None

    cur.execute("SELECT COUNT(DISTINCT artist) FROM tracks WHERE user_id = %s", (user_id,))
    artist_count = cur.fetchone()[0]

    cur.execute("""SELECT (release_year/10)*10 AS decade, COUNT(*)
                   FROM tracks WHERE user_id = %s AND release_year >= 1950
                   GROUP BY decade ORDER BY decade""", (user_id,))
    decade_distribution = [{"decade": int(d), "count": int(c)} for d, c in cur.fetchall()]

    cur.close()
    conn.close()
    return {
        "averages": {
            "tempo": float(avg[0]) if avg[0] else None,
            "energy": float(avg[1]) if avg[1] else None,
            "valence": float(avg[2]) if avg[2] else None,
            "danceability": float(avg[3]) if avg[3] else None,
            "acousticness": float(avg[4]) if avg[4] else None,
            "instrumentalness": float(avg[5]) if avg[5] else None,
            "speechiness": float(avg[6]) if avg[6] else None,
            "total_analyzed": avg[7]
        },
        "mood_distribution": {"dark": mood[0], "neutral": mood[1], "happy": mood[2]},
        "energy_distribution": {"calm": energy_dist[0], "medium": energy_dist[1], "intense": energy_dist[2]},
        "dominant_key": top_key,
        "signature_mood": signature_mood,
        "peak_year": peak_year,
        "peak_year_count": peak_year_count,
        "artist_count": artist_count,
        "decade_distribution": decade_distribution,
        "rabbit_holes": rabbit_holes
    }

@router.get("/top-albums")
def top_albums(
    user_id: str = Depends(get_current_user),
    limit: int = Query(20)
):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT album, artist, COUNT(*) as track_count,
               ROUND(AVG(energy)::numeric, 2)  as avg_energy,
               ROUND(AVG(valence)::numeric, 2) as avg_mood,
               MIN(saved_at)::date             as first_saved
        FROM tracks
        WHERE user_id = %s AND album IS NOT NULL AND album != ''
        GROUP BY album, artist
        ORDER BY track_count DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"albums": [
        {"album": r[0], "artist": r[1], "tracks": r[2],
         "avg_energy": float(r[3]) if r[3] else None,
         "avg_mood": float(r[4]) if r[4] else None,
         "first_saved": str(r[5])}
        for r in rows
    ]}

# ── Top Albums (rich): ownership/completion + real "album listen" sessions ──
# Listening history only goes back to when polling began, so listen-sessions are
# a *growing* secondary signal layered on top of the reliable ownership ranking.
_TOP_ALBUMS_CACHE = {}   # user_id -> (timestamp, payload)
_TOP_ALBUMS_TTL = 3600
_SESSION_GAP = timedelta(minutes=30)   # plays farther apart aren't one sitting


def _listen_sessions(cur, user_id):
    """Best consecutive same-album play-run per album, from listening history.
    Returns {(album_lower, artist_lower): {"run": n, "date": "YYYY-MM-DD"}}."""
    cur.execute("""
        SELECT t.album, t.artist, lh.played_at
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s AND t.album IS NOT NULL AND t.album != ''
        ORDER BY lh.played_at ASC
    """, (user_id,))
    best = {}
    cur_key = cur_start = last_at = None
    run = 0

    def _flush():
        if not cur_key or run < 2:
            return
        prev = best.get(cur_key)
        if not prev or run > prev["run"]:
            best[cur_key] = {"run": run, "date": str(cur_start.date())}

    for album, artist, played_at in cur.fetchall():
        key = (album.lower(), (artist or "").lower())
        if key == cur_key and last_at and (played_at - last_at) <= _SESSION_GAP:
            run += 1
        else:
            _flush()
            cur_key, cur_start, run = key, played_at, 1
        last_at = played_at
    _flush()
    return best


@router.get("/top-albums-rich")
def top_albums_rich(
    user_id: str = Depends(get_current_user),
    limit: int = Query(50, le=60),
):
    cached = _TOP_ALBUMS_CACHE.get(user_id)
    if cached and (time.time() - cached[0] < _TOP_ALBUMS_TTL):
        return {"albums": cached[1][:limit], "cached": True}

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT album, artist, COUNT(*) AS owned,
               ROUND(AVG(energy)::numeric, 2)  AS avg_energy,
               ROUND(AVG(valence)::numeric, 2) AS avg_mood,
               MIN(saved_at)::date             AS first_saved
        FROM tracks
        WHERE user_id = %s AND album IS NOT NULL AND album != ''
        GROUP BY album, artist
        ORDER BY owned DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    sessions = _listen_sessions(cur, user_id)
    cur.close(); conn.close()

    albums = []
    for album, artist, owned, avg_energy, avg_mood, first_saved in rows:
        cov = fetch_album_cover(album, artist)
        total = cov.get("nb_tracks")
        completion = round(min(owned / total, 1.0), 2) if total else None
        sess = sessions.get((album.lower(), (artist or "").lower()))
        listened = bool(sess and (sess["run"] >= 4 or (total and sess["run"] >= 0.5 * total)))
        albums.append({
            "album": album, "artist": artist,
            "owned": owned, "total_tracks": total, "completion": completion,
            "cover": cov.get("cover"),
            "avg_energy": float(avg_energy) if avg_energy else None,
            "avg_mood": float(avg_mood) if avg_mood else None,
            "first_saved": str(first_saved),
            "listen_session": {"run": sess["run"], "date": sess["date"]} if listened else None,
        })

    _TOP_ALBUMS_CACHE[user_id] = (time.time(), albums)
    return {"albums": albums}


@router.get("/taste-timeline")
def taste_timeline(user_id: str = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            DATE_TRUNC('month', lh.played_at)      as month,
            ROUND(AVG(t.energy)::numeric, 3)       as energy,
            ROUND(AVG(t.valence)::numeric, 3)      as valence,
            ROUND(AVG(t.tempo)::numeric, 1)        as tempo,
            ROUND(AVG(t.danceability)::numeric, 3) as danceability,
            ROUND(AVG(t.acousticness)::numeric, 3) as acousticness,
            COUNT(*)                               as plays
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s AND t.energy IS NOT NULL
        GROUP BY DATE_TRUNC('month', lh.played_at)
        ORDER BY month ASC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"timeline": [
        {"month": str(r[0])[:7], "energy": float(r[1]) if r[1] else None,
         "valence": float(r[2]) if r[2] else None, "tempo": float(r[3]) if r[3] else None,
         "danceability": float(r[4]) if r[4] else None,
         "acousticness": float(r[5]) if r[5] else None, "plays": r[6]}
        for r in rows
    ]}

@router.get("/taste-timeline-insights")
def taste_timeline_insights(user_id: str = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            DATE_TRUNC('month', lh.played_at) as month,
            ROUND(AVG(t.energy)::numeric, 3)       as energy,
            ROUND(AVG(t.valence)::numeric, 3)      as valence,
            ROUND(AVG(t.tempo)::numeric, 1)        as tempo,
            ROUND(AVG(t.danceability)::numeric, 3) as danceability,
            ROUND(AVG(t.acousticness)::numeric, 3) as acousticness,
            COUNT(*)                               as plays
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s AND t.energy IS NOT NULL
        GROUP BY DATE_TRUNC('month', lh.played_at)
        ORDER BY month ASC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    if len(rows) < 2:
        return {"enough_data": False, "months_needed": 2, "months_have": len(rows)}

    timeline = [
        {"month": str(r[0])[:7], "energy": float(r[1]) if r[1] else None,
         "valence": float(r[2]) if r[2] else None, "tempo": float(r[3]) if r[3] else None,
         "danceability": float(r[4]) if r[4] else None,
         "acousticness": float(r[5]) if r[5] else None, "plays": r[6]}
        for r in rows
    ]

    def mood_label(v):
        if v is None: return "Unknown"
        if v < 0.30: return "Dark"
        if v < 0.45: return "Melancholic"
        if v < 0.60: return "Neutral"
        if v < 0.75: return "Upbeat"
        return "Bright"

    def energy_label(e):
        if e is None: return "Unknown"
        if e < 0.30: return "Calm"
        if e < 0.50: return "Mellow"
        if e < 0.65: return "Mid"
        if e < 0.80: return "Driven"
        return "Intense"

    def tempo_label(t):
        if t is None: return "Unknown"
        if t < 80: return "Very Slow"
        if t < 100: return "Slow"
        if t < 120: return "Mid-tempo"
        if t < 140: return "Upbeat"
        return "Fast"

    def acoustic_label(a):
        if a is None: return "Unknown"
        if a < 0.20: return "Electric"
        if a < 0.50: return "Mixed"
        return "Acoustic"

    def era_name(valence, energy):
        m = mood_label(valence)
        e = energy_label(energy)
        combos = {
            ("Dark","Calm"): "Quiet Darkness", ("Dark","Mellow"): "Brooding",
            ("Dark","Mid"): "Heavy & Driven", ("Dark","Driven"): "Dark & Driven",
            ("Dark","Intense"): "Rage Mode",
            ("Melancholic","Calm"): "Introspective", ("Melancholic","Mellow"): "Late Night Feels",
            ("Melancholic","Mid"): "Searching", ("Melancholic","Driven"): "Restless",
            ("Melancholic","Intense"): "Cathartic",
            ("Neutral","Calm"): "Easy Listening", ("Neutral","Mellow"): "Coasting",
            ("Neutral","Mid"): "Balanced", ("Neutral","Driven"): "Focused",
            ("Neutral","Intense"): "In the Zone",
            ("Upbeat","Calm"): "Warm & Soft", ("Upbeat","Mellow"): "Breezy",
            ("Upbeat","Mid"): "Feel-Good", ("Upbeat","Driven"): "Energised",
            ("Upbeat","Intense"): "Peak Energy",
            ("Bright","Calm"): "Sunny", ("Bright","Mellow"): "Glowing",
            ("Bright","Mid"): "Good Vibes", ("Bright","Driven"): "Electric",
            ("Bright","Intense"): "Full Send",
        }
        return combos.get((m, e), f"{m} & {e}")

    labeled = []
    for m in timeline:
        labeled.append({
            **m,
            "mood_label": mood_label(m["valence"]),
            "energy_label": energy_label(m["energy"]),
            "tempo_label": tempo_label(m["tempo"]),
            "acoustic_label": acoustic_label(m["acousticness"]),
            "era_name": era_name(m["valence"], m["energy"]),
            "mood_pct": round(m["valence"] * 100) if m["valence"] else None,
            "energy_pct": round(m["energy"] * 100) if m["energy"] else None,
        })

    biggest_mood_shift = None
    biggest_energy_shift = None
    for i in range(1, len(labeled)):
        prev = labeled[i - 1]
        curr = labeled[i]
        if prev["valence"] and curr["valence"]:
            delta = curr["valence"] - prev["valence"]
            if biggest_mood_shift is None or abs(delta) > abs(biggest_mood_shift["delta"]):
                biggest_mood_shift = {
                    "month": curr["month"], "delta": round(delta, 3),
                    "direction": "brighter" if delta > 0 else "darker",
                    "from_label": prev["mood_label"], "to_label": curr["mood_label"],
                    "from_pct": round(prev["valence"] * 100), "to_pct": round(curr["valence"] * 100),
                }
        if prev["energy"] and curr["energy"]:
            delta = curr["energy"] - prev["energy"]
            if biggest_energy_shift is None or abs(delta) > abs(biggest_energy_shift["delta"]):
                biggest_energy_shift = {
                    "month": curr["month"], "delta": round(delta, 3),
                    "direction": "more intense" if delta > 0 else "more mellow",
                    "from_label": prev["energy_label"], "to_label": curr["energy_label"],
                    "from_pct": round(prev["energy"] * 100), "to_pct": round(curr["energy"] * 100),
                }

    first = labeled[0]
    last  = labeled[-1]
    mood_drift   = round((last["valence"] - first["valence"]) * 100) if (last["valence"] and first["valence"]) else None
    energy_drift = round((last["energy"] - first["energy"]) * 100)   if (last["energy"] and first["energy"])   else None
    tempo_drift  = round(last["tempo"] - first["tempo"])              if (last["tempo"] and first["tempo"])     else None

    eras = []
    if labeled:
        cur_name  = labeled[0]["era_name"]
        era_start = labeled[0]["month"]
        era_mos   = [labeled[0]]
        for m in labeled[1:]:
            if m["era_name"] == cur_name:
                era_mos.append(m)
            else:
                eras.append({
                    "name": cur_name, "start": era_start, "end": era_mos[-1]["month"],
                    "months": [e["month"] for e in era_mos],
                    "avg_mood_pct": round(sum(e["mood_pct"] for e in era_mos if e["mood_pct"]) / max(1, sum(1 for e in era_mos if e["mood_pct"]))),
                    "avg_energy_pct": round(sum(e["energy_pct"] for e in era_mos if e["energy_pct"]) / max(1, sum(1 for e in era_mos if e["energy_pct"]))),
                })
                cur_name = m["era_name"]
                era_start = m["month"]
                era_mos = [m]
        eras.append({
            "name": cur_name, "start": era_start, "end": era_mos[-1]["month"],
            "months": [e["month"] for e in era_mos],
            "avg_mood_pct": round(sum(e["mood_pct"] for e in era_mos if e["mood_pct"]) / max(1, sum(1 for e in era_mos if e["mood_pct"]))),
            "avg_energy_pct": round(sum(e["energy_pct"] for e in era_mos if e["energy_pct"]) / max(1, sum(1 for e in era_mos if e["energy_pct"]))),
        })

    narrative_parts = []
    if mood_drift is not None:
        if abs(mood_drift) <= 3: narrative_parts.append("Your mood has stayed remarkably consistent")
        elif mood_drift > 0: narrative_parts.append(f"Your taste has gotten {abs(mood_drift)}% brighter overall")
        else: narrative_parts.append(f"Your taste has gotten {abs(mood_drift)}% darker overall")
    if energy_drift is not None:
        if abs(energy_drift) <= 3: narrative_parts.append("with steady energy throughout")
        elif energy_drift > 0: narrative_parts.append(f"with a noticeable push toward more intense music (+{abs(energy_drift)}% energy)")
        else: narrative_parts.append(f"while mellowing out on energy (-{abs(energy_drift)}%)")
    if biggest_mood_shift:
        narrative_parts.append(
            f"The biggest shift hit in {biggest_mood_shift['month']}, "
            f"when your mood swung from {biggest_mood_shift['from_label']} to {biggest_mood_shift['to_label']}"
        )
    narrative = ". ".join(narrative_parts) + "." if narrative_parts else "Keep listening - your story is just getting started."
    current_chapter = labeled[-1]["era_name"] if labeled else None

    return {
        "enough_data": True, "total_months": len(labeled),
        "labeled_months": labeled, "eras": eras,
        "biggest_mood_shift": biggest_mood_shift,
        "biggest_energy_shift": biggest_energy_shift,
        "mood_drift": mood_drift, "energy_drift": energy_drift, "tempo_drift": tempo_drift,
        "narrative": narrative, "current_chapter": current_chapter,
        "first_era": eras[0]["name"] if eras else None,
        "current_era": eras[-1]["name"] if eras else None,
    }
