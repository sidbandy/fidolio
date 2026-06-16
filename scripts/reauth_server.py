"""
reauth_server.py
----------------
Starts a tiny local server on port 8000, opens Spotify auth in your browser,
catches the callback automatically, and writes .cache.
No copy-pasting. No race conditions.

Usage:
  1. Stop uvicorn if it's running (port 8000 needs to be free)
  2. python scripts/reauth_server.py
  3. Log in to Spotify in the browser that opens
  4. Done — terminal prints confirmation
"""
import os, sys, webbrowser, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])

cache_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.cache'))

auth = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
    redirect_uri="http://127.0.0.1:8000/auth/callback",
    scope=SCOPE,
    open_browser=False,
    cache_path=cache_path,
)

received_code = [None]
done = threading.Event()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        if "code" in params:
            received_code[0] = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
<html><body style="background:#080808;color:#1db954;font-family:system-ui,monospace;
  display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <div style="font-size:48px">&#10003;</div>
  <h2 style="font-weight:800;margin:12px 0 6px">Authorized!</h2>
  <p style="color:#888;margin:0">Close this tab and go back to your terminal.</p>
</div></body></html>""")
            done.set()
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: no code in callback")

    def log_message(self, *args):
        pass  # silence request logs


# Check port is free
import socket
try:
    s = socket.socket()
    s.bind(("127.0.0.1", 8000))
    s.close()
except OSError:
    print("\n✗  Port 8000 is in use — stop uvicorn first (Ctrl+C in the backend terminal), then re-run this script.")
    sys.exit(1)

server = HTTPServer(("127.0.0.1", 8000), Handler)
thread = threading.Thread(target=server.serve_forever)
thread.daemon = True
thread.start()

url = auth.get_authorize_url()
print(f"\nOpening Spotify in your browser...")
print(f"(If it doesn't open, paste this URL manually:\n{url}\n)")
webbrowser.open(url)

print("Waiting for you to approve in the browser...")
done.wait(timeout=300)
server.shutdown()

if not received_code[0]:
    print("✗  Timed out. Run the script again.")
    sys.exit(1)

print("Got code — exchanging for token...")
try:
    auth.get_access_token(received_code[0], as_dict=False)
    sp = spotipy.Spotify(auth_manager=auth)
    me = sp.current_user()
    print(f"\n✓  Re-authorized as {me['display_name']} ({me['id']})")
    print(f"✓  Token written to: {cache_path}")
    print("✓  Scopes include playlist-modify — playlist creation will work now.\n")
except Exception as e:
    print(f"✗  Token exchange failed: {e}")
    sys.exit(1)
