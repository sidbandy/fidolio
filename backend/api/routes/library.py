from fastapi import APIRouter

router = APIRouter()

@router.get("/duplicates")
def find_duplicates():
    """Find duplicate songs across your saved library and playlists."""
    return {"duplicates": []}

@router.get("/dead-songs")
def find_dead_songs(days_unplayed: int = 365):
    """Songs saved but never played in the given time window."""
    return {"dead_songs": []}

@router.get("/ghost-tracks")
def find_ghost_tracks():
    """Songs removed from Spotify still sitting in your playlists."""
    return {"ghost_tracks": []}
