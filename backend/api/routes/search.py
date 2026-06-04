from fastapi import APIRouter, Query

router = APIRouter()

@router.get("/")
def natural_language_search(q: str = Query(...)):
    """
    Search your library in plain English.
    e.g. 'sad slow song I saved in 2022' or 'fast chaotic one with no lyrics'
    Parses intent -> audio feature filters -> vector similarity search
    """
    return {"query": q, "results": []}
