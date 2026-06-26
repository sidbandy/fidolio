"""Drop a user's cached derived data after their library changes, so boards/stats refresh
immediately instead of waiting for a TTL. Called after a sync adds/removes tracks, and on unsave."""
import importlib

# (module path, dict attribute) — each is a {user_id: (timestamp, payload)} cache.
_USER_CACHES = [
    ("api.routes.stats",  "_SONIC_CACHE"),        # Identity "analyzing your sound" (heaviest)
    ("api.routes.stats",  "_TOP_ALBUMS_CACHE"),   # Top Albums board
    ("api.routes.albums", "_BS_CACHE"),           # Discover blind spots
    ("core.similarity",   "_STATS_CACHE"),        # taste centroid used by recs/play-next
]


def invalidate_user(user_id):
    if not user_id:
        return
    for mod_path, attr in _USER_CACHES:
        try:
            cache = getattr(importlib.import_module(mod_path), attr, None)
            if isinstance(cache, dict):
                cache.pop(user_id, None)
        except Exception:
            pass
