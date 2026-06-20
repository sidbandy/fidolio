from fastapi import APIRouter, Query
from typing import Optional
import psycopg2, requests, re, os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)

VIBE_WORDS = {
    "sad","slow","fast","chill","calm","dark","happy","upbeat","acoustic",
    "electronic","hype","study","focus","soft","quiet","loud","mellow","songs",
    "music","tracks","stuff","something","vibe","vibes","mood","feeling","feel",
    "playlist","for","from","the","a","an","i","me","my","give","find","play",
    "want","need","like","sounds","kind","sort","of","some","any","that","this",
    "old","new","classic","good","great","cool","nice","instrumental","lo","fi",
    "lofi","late","night","morning","afternoon","evening","nostalgic","throwback",
    "emotional","emo","energetic","intense","heavy","light","fun","party","dance",
    "workout","gym","run","driving","road","trip","sleepy","dreamy","raw","warm",
    "song","track","music","stuff","things","type","kind","get","something","give",
    "really","very","super","pretty","kinda","sorta","maybe","just","only","more",
}

def fuzzy_find_artist(query: str, db_artists: list) -> Optional[str]:
    """Find artist name in query using fuzzy matching. Returns None if no confident match."""
    if not db_artists:
        return None
    try:
        from rapidfuzz import process, fuzz

        words = query.lower().split()

        # Build candidate phrases — skip phrases made entirely of vibe words
        candidates = []
        for n in range(4, 0, -1):
            for i in range(len(words) - n + 1):
                phrase = " ".join(words[i:i+n])
                if not set(phrase.split()).issubset(VIBE_WORDS):
                    candidates.append(phrase)

        best_artist = None
        best_score  = 0

        for candidate in candidates:
            result = process.extractOne(
                candidate,
                db_artists,
                scorer=fuzz.token_sort_ratio,
                score_cutoff=85
            )
            if result and result[1] > best_score:
                best_score  = result[1]
                best_artist = result[0]

        return best_artist

    except ImportError:
        # rapidfuzz not installed — fall back to exact substring matching
        q_lower = query.lower()
        for artist in sorted(db_artists, key=len, reverse=True):
            if artist.lower() in q_lower and len(artist) > 3:
                return artist
        return None
    except Exception:
        return None


def parse_nlp(query: str, db_artists: list = None) -> dict:
    q            = query.lower().strip()
    filters      = {}
    explanations = []

    # ── Mood ──
    if any(w in q for w in ["sad","melancholy","dark","depressed","cry","heartbreak",
                              "emotional","emo","gloomy","somber","melancholic"]):
        filters["max_valence"] = 0.35
        explanations.append("dark / sad mood")
    elif any(w in q for w in ["happy","upbeat","good vibes","feel good","joyful",
                               "fun","cheerful","bright","positive","uplifting"]):
        filters["min_valence"] = 0.65
        explanations.append("happy mood")

    # ── Energy ──
    if any(w in q for w in ["chill","calm","relax","mellow","soft","peaceful",
                              "quiet","lofi","lo-fi","background","late night"]):
        filters["max_energy"] = 0.42
        explanations.append("low energy / chill")
    elif any(w in q for w in ["hype","pump","workout","intense","energetic",
                               "banger","rage","aggressive","high energy"]):
        filters["min_energy"] = 0.78
        explanations.append("high energy")

    # ── Study ──
    if any(w in q for w in ["study","focus","concentrate","work","productive"]):
        filters["max_energy"]      = 0.45
        filters["max_speechiness"] = 0.12
        explanations.append("focus / study")

    # ── Tempo ──
    if any(w in q for w in ["slow","ballad","dragging"]):
        filters["max_tempo"] = 95
        explanations.append("slow tempo")
    elif any(w in q for w in ["fast","quick","sprint","rapid"]):
        filters["min_tempo"] = 135
        explanations.append("fast tempo")

    # ── Acoustic ──
    if any(w in q for w in ["acoustic","unplugged","folk","raw","stripped","campfire"]):
        filters["min_acousticness"] = 0.6
        explanations.append("acoustic")
    elif any(w in q for w in ["electronic","synth","edm","club","produced","digital"]):
        filters["max_acousticness"] = 0.1
        explanations.append("electronic")

    # ── Instrumental ──
    if any(w in q for w in ["instrumental","no vocals","no lyrics","wordless"]):
        filters["max_speechiness"] = 0.05
        explanations.append("instrumental")

    # ── Language ──
    # Maps natural phrasing → the language tag stored on tracks.language
    LANG_KEYWORDS = {
        "bengali":   ["bengali", "bangla"],
        "hindi":     ["hindi", "bollywood", "desi"],
        "punjabi":   ["punjabi", "bhangra"],
        "arabic":    ["arabic", "arab"],
        "spanish":   ["spanish", "español", "espanol", "latino", "latin"],
        "french":    ["french", "français", "francais"],
        "portuguese":["portuguese", "português", "brazilian", "bossa"],
        "japanese":  ["japanese", "jpop", "j-pop", "city pop"],
        "chinese":   ["chinese", "mandarin", "cantonese", "cpop", "c-pop"],
        "korean":    ["korean", "kpop", "k-pop"],
        "tamil":     ["tamil"],
        "telugu":    ["telugu"],
        "urdu":      ["urdu", "ghazal", "qawwali"],
    }
    for lang, kws in LANG_KEYWORDS.items():
        if any(re.search(rf"\b{re.escape(kw)}\b", q) for kw in kws):
            filters["language"] = lang
            explanations.append(f"{lang} language")
            # strip matched keyword(s) so they don't pollute text/artist matching
            for kw in kws:
                q = re.sub(rf"\b{re.escape(kw)}\b", "", q)
            q = q.strip()
            break

    # ── Decade detection ──
    decade_map = {
        "2020s":(2020,2029),"20s":(2020,2029),
        "2010s":(2010,2019),"10s":(2010,2019),
        "2000s":(2000,2009),"00s":(2000,2009),
        "90s":  (1990,1999),"1990s":(1990,1999),
        "80s":  (1980,1989),"1980s":(1980,1989),
        "70s":  (1970,1979),"1970s":(1970,1979),
    }
    decade_found = None
    for kw,(mn,mx) in decade_map.items():
        if kw in q:
            decade_found = (mn, mx)
            explanations.append(f"from the {kw}")
            q = q.replace(kw, "").strip()
            break

    # ── Specific year ──
    if not decade_found:
        ym = re.search(r'\b(19[6-9]\d|20[0-2]\d)\b', q)
        if ym:
            yr = int(ym.group())
            decade_found = (yr, yr)
            q = q.replace(ym.group(), "").strip()
            explanations.append(f"from {yr}")

    if decade_found:
        filters["decade_min"] = decade_found[0]
        filters["decade_max"] = decade_found[1]

    # ── Fuzzy artist matching ──
    artist_match = None
    if db_artists:
        artist_match = fuzzy_find_artist(q, db_artists)
        if artist_match:
            explanations.append(f"artist: {artist_match}")
            # Remove the artist name from remaining text
            q = re.sub(re.escape(artist_match.lower()), "", q,
                       flags=re.IGNORECASE).strip()

    # ── Remaining text after removing vibe words and artist ──
    remaining_words = [w for w in q.split()
                      if w not in VIBE_WORDS and len(w) > 2]
    remaining = " ".join(remaining_words) if remaining_words else None

    return {
        "filters":     filters,
        "artist":      artist_match,
        "text":        remaining,
        "explanation": ", ".join(explanations) if explanations else None
    }


def run_search(user_id, filters, artist, text, limit, decade_fallback=True):
    """Execute a search query and return (total, rows)."""
    conn = get_conn()
    cur  = conn.cursor()

    clauses = ["user_id = %s"]
    params  = [user_id]

    if artist:
        clauses.append("LOWER(artist) LIKE %s")
        params.append(f"%{artist.lower()}%")

    if text:
        clauses.append("(LOWER(name) LIKE %s OR LOWER(album) LIKE %s)")
        params.extend([f"%{text.lower()}%"] * 2)

    if filters.get("language"):
        clauses.append("language = %s")
        params.append(filters["language"])

    feature_map = [
        ("min_valence",      "valence >= %s"),
        ("max_valence",      "valence <= %s"),
        ("min_energy",       "energy >= %s"),
        ("max_energy",       "energy <= %s"),
        ("min_tempo",        "tempo >= %s"),
        ("max_tempo",        "tempo <= %s"),
        ("min_acousticness", "acousticness >= %s"),
        ("max_acousticness", "acousticness <= %s"),
        ("max_speechiness",  "speechiness <= %s"),
    ]
    for key, clause in feature_map:
        if filters.get(key) is not None:
            clauses.append(clause)
            params.append(filters[key])

    # Decade filter — use release_year when available, otherwise skip decade filter gracefully
    if filters.get("decade_min") is not None:
        mn = filters["decade_min"]
        mx = filters["decade_max"]
        # Use release_year if not null, otherwise don't filter those tracks out
        clauses.append(
            "(release_year IS NULL OR (release_year >= %s AND release_year <= %s))"
        )
        params.extend([mn, mx])

    where = "WHERE " + " AND ".join(clauses)
    cur.execute(f"SELECT COUNT(*) FROM tracks {where}", params.copy())
    total = cur.fetchone()[0]

    # Order: artist matches first, then by relevance
    order = "CASE WHEN LOWER(artist) LIKE %s THEN 0 ELSE 1 END, RANDOM()" if artist else "RANDOM()"
    order_params = [f"%{artist.lower()}%"] if artist else []

    cur.execute(f"""
        SELECT id, name, artist, album, saved_at, release_year,
               tempo, energy, valence, danceability, acousticness, language
        FROM tracks {where}
        ORDER BY {order}
        LIMIT %s
    """, params + order_params + [limit])
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return total, rows


def fmt(rows):
    return [{
        "id":           r[0], "name":         r[1],
        "artist":       r[2], "album":        r[3],
        "saved_at":     str(r[4])[:10],
        "release_year": r[5],
        "tempo":        round(float(r[6]),  1) if r[6]  else None,
        "energy":       round(float(r[7]),  2) if r[7]  else None,
        "valence":      round(float(r[8]),  2) if r[8]  else None,
        "danceability": round(float(r[9]),  2) if r[9]  else None,
        "acousticness": round(float(r[10]), 2) if r[10] else None,
        "language":     r[11] if len(r) > 11 else None,
        "spotify_url":  f"https://open.spotify.com/track/{r[0]}"
    } for r in rows]


@router.get("/nlp")
def nlp_search(
    q:       str = Query(...),
    limit:   int = Query(20, le=100),
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
):
    # Load all artists for fuzzy matching
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT DISTINCT artist FROM tracks WHERE user_id = %s", (user_id,))
    db_artists = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    parsed = parse_nlp(q, db_artists)
    f      = parsed["filters"]

    # Try full search first
    total, rows = run_search(user_id, f, parsed["artist"], parsed["text"], limit)

    # If 0 results and we had a text filter, retry without it
    if total == 0 and parsed["text"]:
        total, rows = run_search(user_id, f, parsed["artist"], None, limit)

    # If still 0 and we had an artist, retry with just artist + audio features
    if total == 0 and parsed["artist"]:
        total, rows = run_search(user_id, f, parsed["artist"], None, limit)

    # If still 0 and audio features are the only filter, widen them slightly
    if total == 0 and not parsed["artist"]:
        wide = {}
        for k, v in f.items():
            if "min_" in k: wide[k] = max(0, v - 0.1)
            elif "max_" in k and "tempo" not in k: wide[k] = min(1, v + 0.1)
            elif "max_tempo" in k: wide[k] = v + 15
            elif "min_tempo" in k: wide[k] = max(0, v - 15)
            else: wide[k] = v
        total, rows = run_search(user_id, wide, None, None, limit)

    return {
        "query":        q,
        "interpreted":  parsed["explanation"],
        "artist_match": parsed["artist"],
        "total":        total,
        "results":      fmt(rows)
    }


@router.get("/")
def search_library(
    q:                Optional[str]   = Query(None),
    min_tempo:        Optional[float] = Query(None),
    max_tempo:        Optional[float] = Query(None),
    min_energy:       Optional[float] = Query(None),
    max_energy:       Optional[float] = Query(None),
    min_valence:      Optional[float] = Query(None),
    max_valence:      Optional[float] = Query(None),
    min_acousticness: Optional[float] = Query(None),
    max_acousticness: Optional[float] = Query(None),
    max_speechiness:  Optional[float] = Query(None),
    min_year:         Optional[int]   = Query(None),
    max_year:         Optional[int]   = Query(None),
    artist:           Optional[str]   = Query(None),
    language:         Optional[str]   = Query(None),
    limit:            int             = Query(20, le=100),
    offset:           int             = Query(0),
    user_id:          str             = Query("0tz6fep2m5bx1vq85g48518u9"),
):
    conn = get_conn()
    cur  = conn.cursor()
    clauses = ["user_id = %s"]
    params  = [user_id]

    if q:
        clauses.append("(LOWER(name) LIKE %s OR LOWER(artist) LIKE %s OR LOWER(album) LIKE %s)")
        params.extend([f"%{q.lower()}%"] * 3)
    if artist:
        clauses.append("LOWER(artist) LIKE %s")
        params.append(f"%{artist.lower()}%")
    if language:
        clauses.append("language = %s")
        params.append(language.lower())
    if min_tempo        is not None: clauses.append("tempo >= %s");        params.append(min_tempo)
    if max_tempo        is not None: clauses.append("tempo <= %s");        params.append(max_tempo)
    if min_energy       is not None: clauses.append("energy >= %s");       params.append(min_energy)
    if max_energy       is not None: clauses.append("energy <= %s");       params.append(max_energy)
    if min_valence      is not None: clauses.append("valence >= %s");      params.append(min_valence)
    if max_valence      is not None: clauses.append("valence <= %s");      params.append(max_valence)
    if min_acousticness is not None: clauses.append("acousticness >= %s"); params.append(min_acousticness)
    if max_acousticness is not None: clauses.append("acousticness <= %s"); params.append(max_acousticness)
    if max_speechiness  is not None: clauses.append("speechiness <= %s");  params.append(max_speechiness)
    if min_year         is not None: clauses.append("release_year >= %s"); params.append(min_year)
    if max_year         is not None: clauses.append("release_year <= %s"); params.append(max_year)

    where = "WHERE " + " AND ".join(clauses)
    cur.execute(f"SELECT COUNT(*) FROM tracks {where}", params.copy())
    total = cur.fetchone()[0]
    params.extend([limit, offset])
    cur.execute(f"""
        SELECT id, name, artist, album, saved_at, release_year,
               tempo, energy, valence, danceability, acousticness, preview_url, language
        FROM tracks {where}
        ORDER BY saved_at DESC
        LIMIT %s OFFSET %s
    """, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "total": total,
        "results": [{
            "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
            "saved_at": str(r[4])[:10], "release_year": r[5],
            "tempo":        round(float(r[6]),  1) if r[6]  else None,
            "energy":       round(float(r[7]),  2) if r[7]  else None,
            "valence":      round(float(r[8]),  2) if r[8]  else None,
            "danceability": round(float(r[9]),  2) if r[9]  else None,
            "acousticness": round(float(r[10]), 2) if r[10] else None,
            "preview_url":  r[11],
            "language":     r[12],
            "spotify_url":  f"https://open.spotify.com/track/{r[0]}"
        } for r in rows]
    }


def weather_profile(lat, lon):
    """Current weather → audio-feature filters. Shared by /weather-vibe and the
    recommendation engine so weather works as a filter alongside everything else."""
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon,
                    "current_weather": "true", "temperature_unit": "celsius"},
            timeout=8)
        cw = resp.json()["current_weather"]
        code = int(cw["weathercode"]); temp = float(cw["temperature"])
    except Exception as e:
        return {"error": f"Weather fetch failed: {e}"}

    if code >= 95:
        wf = {"max_valence": 0.35, "min_energy": 0.6}; explanation = "thunderstorm → dark and intense"
    elif code in range(61, 68) or code in range(80, 83):
        wf = {"max_valence": 0.4, "max_energy": 0.5}; explanation = "rainy → melancholy and mellow"
    elif code in range(51, 58):
        wf = {"max_valence": 0.5, "max_energy": 0.45, "min_acousticness": 0.3}; explanation = "drizzling → soft and reflective"
    elif code in range(71, 78) or code in range(85, 87):
        wf = {"max_energy": 0.4, "min_acousticness": 0.4}; explanation = "snowing → calm and cozy"
    elif code in (45, 48):
        wf = {"max_energy": 0.35, "max_valence": 0.5}; explanation = "foggy → dreamy and slow"
    elif code == 0 and temp > 25:
        wf = {"min_valence": 0.6, "min_energy": 0.6}; explanation = "clear and hot → upbeat and energetic"
    elif code in (0, 1) and temp > 15:
        wf = {"min_valence": 0.55}; explanation = "clear and pleasant → good vibes"
    elif code in (0, 1) and temp <= 10:
        wf = {"max_valence": 0.55, "min_acousticness": 0.3}; explanation = "clear and cold → crisp and introspective"
    else:
        wf = {"max_energy": 0.6}; explanation = "cloudy → neutral and mellow"
    return {"code": code, "temperature": temp, "explanation": explanation, "filters": wf}


@router.get("/weather-vibe")
def get_weather_vibe(
    lat:     float = Query(...),
    lon:     float = Query(...),
    user_id: str   = Query("0tz6fep2m5bx1vq85g48518u9"),
    limit:   int   = Query(20),
):
    wp = weather_profile(lat, lon)
    if "error" in wp:
        return {"error": wp["error"]}
    code, temp, explanation, wf = wp["code"], wp["temperature"], wp["explanation"], wp["filters"]

    conn = get_conn()
    cur  = conn.cursor()
    clauses = ["user_id = %s", "energy IS NOT NULL"]
    params  = [user_id]
    fmap = {
        "min_valence":      "valence >= %s",
        "max_valence":      "valence <= %s",
        "min_energy":       "energy >= %s",
        "max_energy":       "energy <= %s",
        "min_acousticness": "acousticness >= %s",
    }
    for key, clause in fmap.items():
        if key in wf:
            clauses.append(clause)
            params.append(wf[key])

    where = "WHERE " + " AND ".join(clauses)
    params.append(limit)
    cur.execute(f"""
        SELECT id, name, artist, album, tempo, energy, valence, acousticness
        FROM tracks {where} ORDER BY RANDOM() LIMIT %s
    """, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "weather": {"code": code, "temperature": temp, "explanation": explanation},
        "results": [{
            "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
            "tempo":  round(float(r[4]), 1) if r[4] else None,
            "energy": round(float(r[5]), 2) if r[5] else None,
            "valence":round(float(r[6]), 2) if r[6] else None,
            "spotify_url": f"https://open.spotify.com/track/{r[0]}"
        } for r in rows]
    }


@router.get("/preview")
def get_deezer_preview(track_name: str = Query(...), artist: str = Query(...)):
    try:
        resp    = requests.get("https://api.deezer.com/search",
                               params={"q": f"{artist} {track_name}", "limit": 10},
                               timeout=8)
        results = resp.json().get("data", [])
        for t in results:
            t_title  = t.get("title","").lower()
            t_artist = t.get("artist",{}).get("name","").lower()
            if (track_name.lower() in t_title or t_title in track_name.lower()) \
               and (artist.lower() in t_artist or t_artist in artist.lower()) \
               and t.get("preview"):
                return {"found": True, "preview_url": t["preview"], "deezer_id": t["id"]}
        for t in results:
            if t.get("preview"):
                return {"found": True, "preview_url": t["preview"],
                        "deezer_id": t["id"], "approximate": True}
        return {"found": False}
    except Exception as e:
        return {"found": False, "error": str(e)}