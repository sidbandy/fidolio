import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv('backend/.env')

SCOPE = " ".join([
    "user-library-read",
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-currently-playing",
    "user-read-playback-state",
])

def main():
    auth_manager = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri="http://127.0.0.1:8000/auth/callback",
        scope=SCOPE,
        open_browser=True,
        cache_path=".cache"
    )
    sp = spotipy.Spotify(auth_manager=auth_manager)

    user = sp.current_user()
    print(f"\nLogged in as: {user['display_name']}")

    print("\nYour last 5 saved songs:")
    results = sp.current_user_saved_tracks(limit=5)
    for i, item in enumerate(results['items'], 1):
        track = item['track']
        print(f"{i}. {track['name']} — {track['artists'][0]['name']}")

    current = sp.currently_playing()
    if current and current.get('item'):
        print(f"\nCurrently playing: {current['item']['name']} — {current['item']['artists'][0]['name']}")
    else:
        print("\nNothing playing right now.")

    print("\n✓ All scopes working correctly.")

if __name__ == "__main__":
    main()