"""
reauth.py — Re-authorize Spotify with the full scope set (manual paste flow).
No local server needed, so it won't clash with uvicorn's port.
"""
import os, sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv('backend/.env')

SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])

cache_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.cache'))

auth = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
    scope=SCOPE,
    open_browser=False,
    cache_path=cache_path,
)

# Manual flow: print URL, you paste the redirected URL back
auth_url = auth.get_authorize_url()
print("\n1. Open this URL in your browser:\n")
print(auth_url)
print("\n2. Approve the permissions.")
print("3. Your browser will redirect to a URL (it may show an error page — that's fine).")
print("4. Copy the FULL URL from your browser's address bar and paste it below.\n")

redirect_response = input("Paste the full redirect URL here: ").strip()
code = auth.parse_response_code(redirect_response)
token = auth.get_access_token(code, as_dict=False)

sp = spotipy.Spotify(auth=token)
me = sp.current_user()
print(f"\n✓ Re-authorized as {me['display_name']} ({me['id']})")
print(f"✓ Token written to {cache_path}")
print("✓ Scopes now include playlist-modify — you can create playlists.")
