from fastapi import APIRouter

router = APIRouter()

@router.post("/collab/create")
def create_collab_room(name: str):
    """Create a collaborative playlist voting room."""
    return {"room_id": "abc123", "name": name, "share_url": "/collab/abc123"}

@router.post("/automations/create")
def create_automation(rule: dict):
    """
    Smart playlist automation rule.
    e.g. { "condition": "bpm > 140", "target_playlist": "Workout" }
    """
    return {"automation_id": "auto_001", "rule": rule}
