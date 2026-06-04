from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from core.spotify_client import get_auth_url, exchange_code_for_token

router = APIRouter()

@router.get("/login")
def login():
    """Redirect user to Spotify OAuth login."""
    auth_url = get_auth_url()
    return RedirectResponse(auth_url)

@router.get("/callback")
def callback(code: str):
    """Handle Spotify OAuth callback and store tokens."""
    token_info = exchange_code_for_token(code)
    return {"status": "authenticated", "token": token_info}
