"""
spotify_api.py — thin wrappers for Spotify's post-Feb-2026 playlist endpoints.

Spotify's Feb 2026 migration renamed the write endpoints. spotipy still calls the
old paths (POST /users/{id}/playlists, /playlists/{id}/tracks), which now 403.
These helpers call the new paths directly, reusing a spotipy client's token
(so OAuth refresh still works automatically).

  old POST /users/{id}/playlists        -> POST /me/playlists
  old POST /playlists/{id}/tracks       -> POST /playlists/{id}/items
  old PUT  /playlists/{id}/tracks       -> PUT  /playlists/{id}/items
  old DEL  /playlists/{id}/tracks       -> DEL  /playlists/{id}/items
  old GET  /playlists/{id}/tracks       -> GET  /playlists/{id}/items
"""
import requests

BASE = "https://api.spotify.com/v1"


def _headers(sp):
    # get_access_token refreshes if expired, then returns the bearer string
    token = sp.auth_manager.get_access_token(as_dict=False)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def create_playlist(sp, name, public=False, description=""):
    r = requests.post(f"{BASE}/me/playlists", headers=_headers(sp),
                      json={"name": name, "public": public, "description": description},
                      timeout=15)
    r.raise_for_status()
    d = r.json()
    return {"id": d["id"], "url": d["external_urls"]["spotify"]}


def add_items(sp, playlist_id, uris):
    for i in range(0, len(uris), 100):
        r = requests.post(f"{BASE}/playlists/{playlist_id}/items", headers=_headers(sp),
                          json={"uris": uris[i:i+100]}, timeout=20)
        r.raise_for_status()


def replace_items(sp, playlist_id, uris):
    """Replace the whole playlist with `uris` (PUT max 100, then append the rest)."""
    first = uris[:100]
    r = requests.put(f"{BASE}/playlists/{playlist_id}/items", headers=_headers(sp),
                     json={"uris": first}, timeout=20)
    r.raise_for_status()
    if len(uris) > 100:
        add_items(sp, playlist_id, uris[100:])


def remove_items(sp, playlist_id, uris):
    r = requests.delete(f"{BASE}/playlists/{playlist_id}/items", headers=_headers(sp),
                        json={"tracks": [{"uri": u} for u in uris]}, timeout=20)
    r.raise_for_status()


def get_items(sp, playlist_id):
    """Return [{id,name,artists}] for every track in the playlist."""
    items, offset = [], 0
    while True:
        r = requests.get(f"{BASE}/playlists/{playlist_id}/items", headers=_headers(sp),
                         params={"fields": "items(track(id,name,artists)),next",
                                 "limit": 100, "offset": offset}, timeout=20)
        r.raise_for_status()
        d = r.json()
        for it in d.get("items", []):
            t = it.get("track")
            if t and t.get("id"):
                items.append(t)
        if not d.get("next"):
            break
        offset += 100
    return items
