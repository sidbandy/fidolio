import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from api.routes.playlists import (  # noqa: E402
    build_query,
    normalize_playlist_id,
    replace_spotify_playlist,
    rows_to_tracks,
)


class PlaylistRuleTests(unittest.TestCase):
    def test_language_rule_does_not_require_audio_features(self):
        sql, params = build_query(
            [{"field": "language", "op": "eq", "value": "bengali"}],
            [],
            "user-1",
            "saved_at",
            "desc",
            200,
        )

        self.assertIn("language = %s", sql)
        self.assertNotIn("energy IS NOT NULL", sql)
        self.assertEqual(params, ["user-1", "bengali", 200])

    def test_empty_language_include_matches_nothing(self):
        sql, params = build_query(
            [{"field": "language", "op": "eq", "value": []}],
            [],
            "user-1",
            "saved_at",
            "desc",
            50,
        )

        self.assertIn("1=0", sql)
        self.assertEqual(params, ["user-1", 50])

    def test_playlist_id_normalization_accepts_id_url_and_uri(self):
        pid = "37i9dQZF1DXcBWIGoYBM5M"

        self.assertEqual(normalize_playlist_id(pid), pid)
        self.assertEqual(
            normalize_playlist_id(f"https://open.spotify.com/playlist/{pid}?si=abc"),
            pid,
        )
        self.assertEqual(normalize_playlist_id(f"spotify:playlist:{pid}"), pid)

    def test_rows_to_tracks_keeps_zero_feature_values(self):
        rows = [(
            "track-1", "Zero Song", "Artist", "Album",
            0.0, 0.0, 0.0, 0.0, 0.0,
            None, 2020, "english",
        )]

        track = rows_to_tracks(rows)[0]
        self.assertEqual(track["energy"], 0.0)
        self.assertEqual(track["valence"], 0.0)
        self.assertEqual(track["tempo"], 0.0)

    def test_replace_spotify_playlist_clears_when_empty(self):
        calls = []

        class FakeSpotify:
            def playlist_replace_items(self, playlist_id, items):
                calls.append(("replace", playlist_id, items))

            def playlist_add_items(self, playlist_id, items):
                calls.append(("add", playlist_id, items))

        replace_spotify_playlist(FakeSpotify(), "playlist-1", [])
        self.assertEqual(calls, [("replace", "playlist-1", [])])

    def test_replace_spotify_playlist_batches_adds(self):
        calls = []

        class FakeSpotify:
            def playlist_replace_items(self, playlist_id, items):
                calls.append(("replace", playlist_id, items))

            def playlist_add_items(self, playlist_id, items):
                calls.append(("add", playlist_id, len(items), items[0], items[-1]))

        track_ids = [f"track-{i}" for i in range(205)]
        replace_spotify_playlist(FakeSpotify(), "playlist-1", track_ids)

        self.assertEqual(calls[0], ("replace", "playlist-1", []))
        self.assertEqual(calls[1], ("add", "playlist-1", 100, "spotify:track:track-0", "spotify:track:track-99"))
        self.assertEqual(calls[2], ("add", "playlist-1", 100, "spotify:track:track-100", "spotify:track:track-199"))
        self.assertEqual(calls[3], ("add", "playlist-1", 5, "spotify:track:track-200", "spotify:track:track-204"))


if __name__ == "__main__":
    unittest.main()
