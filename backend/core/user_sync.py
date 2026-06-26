"""Per-user library sync (progressive). On first login we return immediately and sync in the
background, updating users.sync_status so the frontend can show a 'building your library' state."""
import threading
import traceback

from core.users import set_sync_status


def _run_sync(user_id):
    try:
        from sync_library import sync_saved_tracks

        def progress(status, detail=None, saved=None, last_sync=False):
            set_sync_status(user_id, status, detail=detail, saved_count=saved, touch_last_sync=last_sync)

        sync_saved_tracks(user_id=user_id, verbose=True, progress=progress)
    except Exception as e:
        traceback.print_exc()
        set_sync_status(user_id, "error", detail=str(e)[:200])


def start_first_sync(user_id):
    """Start a user's library sync in a background thread (login returns immediately). Safe for
    returning users too: we DON'T reset saved_count, so they stay in the app (not the SyncGate)
    while their library refreshes incrementally in the background."""
    set_sync_status(user_id, "syncing", detail="starting…")
    threading.Thread(target=_run_sync, args=(user_id,), daemon=True, name=f"sync-{user_id}").start()
