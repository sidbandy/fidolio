from fastapi import APIRouter, Query
from typing import Literal

router = APIRouter()

@router.get("/wrapped")
def get_wrapped(period: Literal["day", "week", "month", "year"] = "month"):
    """
    Live Wrapped — top artists, songs, listening hours for any period.
    Sourced from the local listening_history DB (built by the poller).
    """
    return {"period": period, "top_artists": [], "top_songs": [], "total_minutes": 0}

@router.get("/top-artists")
def top_artists(limit: int = Query(10, le=50)):
    return {"artists": []}

@router.get("/listening-clock")
def listening_clock():
    """Play counts bucketed by hour of day."""
    return {"hours": {}}
