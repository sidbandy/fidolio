"""Audio-feature similarity core for Fidolio's recommendation engine.

Shared by the discovery routes. Normalizes raw ReccoBeats audio features against
the user's *own* library distribution (z-scores), then scores how close two
tracks/albums sound. This replaces the ad-hoc, unnormalized `taste_score` so that
"similar" means similar relative to THIS library — not a fixed 0..1 scale where a
0.1 tempo gap and a 0.1 valence gap were treated as equal.
"""
import time

# Features used for sonic similarity. Tempo is on a BPM scale, but normalizing
# against the library's own mean/std puts every feature into comparable z-space.
FEATURES = ["energy", "valence", "danceability", "acousticness", "tempo"]

# How much each feature counts toward "sounds alike". Energy + valence carry the
# emotional weight; the rest refine the texture.
WEIGHTS = {
    "energy": 1.3, "valence": 1.3, "danceability": 1.0,
    "acousticness": 0.9, "tempo": 0.8,
}

# Fallbacks when a feature is missing (mid-scale / typical BPM).
DEFAULTS = {
    "energy": 0.5, "valence": 0.5, "danceability": 0.5,
    "acousticness": 0.3, "tempo": 120.0,
}

_STATS_CACHE = {}      # user_id -> (timestamp, {feature: (mean, std)})
_STATS_TTL = 1800      # 30 min — the library distribution barely moves


def library_feature_stats(cur, user_id):
    """Per-feature (mean, std) over the user's enriched tracks, cached 30 min."""
    hit = _STATS_CACHE.get(user_id)
    if hit and (time.time() - hit[0] < _STATS_TTL):
        return hit[1]
    cols = ", ".join(f"AVG({f}), COALESCE(STDDEV_POP({f}), 0)" for f in FEATURES)
    cur.execute(
        f"SELECT {cols} FROM tracks WHERE user_id = %s AND energy IS NOT NULL",
        (user_id,),
    )
    row = cur.fetchone() or []
    stats = {}
    for i, f in enumerate(FEATURES):
        mean = row[i * 2] if i * 2 < len(row) else None
        std = row[i * 2 + 1] if i * 2 + 1 < len(row) else None
        stats[f] = (float(mean) if mean is not None else DEFAULTS[f],
                    float(std) if std else 0.0)
    _STATS_CACHE[user_id] = (time.time(), stats)
    return stats


def _z(raw, mean, std):
    if std <= 1e-6:
        return 0.0
    # clamp extreme outliers so one weird feature can't dominate the distance
    return max(-3.0, min(3.0, (raw - mean) / std))


def to_vector(features, stats):
    """Normalize a raw-feature dict to a z-scored vector aligned with FEATURES."""
    vec = []
    for f in FEATURES:
        raw = features.get(f)
        raw = float(raw) if raw is not None else DEFAULTS[f]
        mean, std = stats[f]
        vec.append(_z(raw, mean, std))
    return vec


def distance(vec_a, vec_b):
    """Weighted Euclidean distance between two z-vectors."""
    total = 0.0
    for i, f in enumerate(FEATURES):
        d = vec_a[i] - vec_b[i]
        total += WEIGHTS[f] * d * d
    return total ** 0.5


def score(vec_a, vec_b):
    """Distance → similarity in (0, 1]; 1.0 == identical sound."""
    return round(1.0 / (1.0 + distance(vec_a, vec_b)), 4)


def merge_features(feature_dicts):
    """Average several raw-feature dicts into one (multi-seed / album average)."""
    valid = [f for f in feature_dicts if f]
    if not valid:
        return dict(DEFAULTS)
    out = {}
    for f in FEATURES:
        vals = [float(d[f]) for d in valid if d.get(f) is not None]
        out[f] = sum(vals) / len(vals) if vals else DEFAULTS[f]
    return out
