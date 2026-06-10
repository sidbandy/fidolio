import { useState, useEffect, useRef } from "react";

const API = "http://127.0.0.1:8000";

export default function NowPlaying() {
  const [track, setTrack]         = useState(null);
  const [lyrics, setLyrics]       = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch(`${API}/nowplaying/current`);
        const data = await res.json();
        if (data.playing) setTrack(data);
        else setTrack(null);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLyrics = async () => {
    if (!track) return;
    setLoadingLyrics(true);
    setLyricsOpen(true);
    try {
      const res  = await fetch(
        `${API}/nowplaying/lyrics-meaning?track_name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`
      );
      const data = await res.json();
      setLyrics(data);
    } catch {}
    setLoadingLyrics(false);
  };

  if (!track) return null;

  const moodColor = (v) => {
    if (!v) return "#555";
    if (v < 0.3) return "#6366f1";
    if (v < 0.6) return "#f59e0b";
    return "#1db954";
  };

  return (
    <>
      {/* Now Playing Bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(10,10,10,0.96)", backdropFilter: "blur(20px)",
        borderTop: "1px solid #1a1a1a", padding: "12px 32px",
        display: "flex", alignItems: "center", gap: "16px",
        zIndex: 1000
      }}>
        {/* Album art */}
        {track.album_art && (
          <img src={track.album_art} alt="album" style={{
            width: "44px", height: "44px", borderRadius: "6px", flexShrink: 0
          }} />
        )}

        {/* Track info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
              {track.name}
            </span>
            <span style={{ color: "#555", fontSize: "13px", whiteSpace: "nowrap" }}>
              — {track.artist}
            </span>
            {track.in_library && (
              <span style={{ fontSize: "10px", color: "#1db954", background: "#0d2b18",
                padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>
                IN LIBRARY
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px" }}>
            <div style={{
              height: "3px", borderRadius: "2px", background: "#1db954",
              width: `${track.progress_pct}%`, transition: "width 1s linear"
            }} />
          </div>
        </div>

        {/* Audio features */}
        {track.features && (
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", flexShrink: 0 }}>
            <span style={{ color: "#444" }}>{Math.round(track.features.tempo)} BPM</span>
            <span style={{ color: moodColor(track.features.valence) }}>
              {track.features.valence < 0.3 ? "dark" :
               track.features.valence < 0.6 ? "neutral" : "happy"}
            </span>
            <span style={{ color: "#444" }}>
              {Math.round(track.features.energy * 100)}% energy
            </span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button onClick={fetchLyrics} style={{
            padding: "6px 14px", borderRadius: "8px", border: "none",
            background: lyricsOpen ? "#1db954" : "#1a1a1a",
            color: lyricsOpen ? "#000" : "#888",
            fontSize: "12px", fontWeight: 600, cursor: "pointer"
          }}>
            What's this about?
          </button>
          <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{
            padding: "6px 14px", borderRadius: "8px",
            background: "#1a1a1a", color: "#888",
            fontSize: "12px", fontWeight: 600, textDecoration: "none"
          }}>
            Open ↗
          </a>
        </div>
      </div>

      {/* Lyrics panel */}
      {lyricsOpen && (
        <div style={{
          position: "fixed", bottom: "72px", right: "32px",
          width: "360px", background: "#111", borderRadius: "16px",
          border: "1px solid #1a1a1a", padding: "24px", zIndex: 999,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>
              {loadingLyrics ? "Looking up..." : lyrics?.title || "Song info"}
            </div>
            <button onClick={() => setLyricsOpen(false)} style={{
              background: "none", border: "none", color: "#555",
              cursor: "pointer", fontSize: "18px", lineHeight: 1
            }}>×</button>
          </div>

          {loadingLyrics && (
            <div style={{ color: "#444", fontSize: "13px" }}>Fetching from Genius...</div>
          )}

          {!loadingLyrics && lyrics && (
            <>
              {lyrics.description ? (
                <p style={{ fontSize: "13px", color: "#aaa", lineHeight: 1.6,
                  marginBottom: "16px" }}>
                  {lyrics.description}
                  {lyrics.description.length >= 598 && "..."}
                </p>
              ) : (
                <p style={{ fontSize: "13px", color: "#444" }}>
                  No description available for this song yet.
                </p>
              )}

              <div style={{ display: "flex", gap: "12px", fontSize: "11px",
                color: "#444", borderTop: "1px solid #1a1a1a", paddingTop: "12px" }}>
                {lyrics.release_date && <span>Released {lyrics.release_date}</span>}
                {lyrics.annotation_count > 0 && (
                  <span>{lyrics.annotation_count} annotations</span>
                )}
                {lyrics.pageviews && (
                  <span>{(lyrics.pageviews / 1000).toFixed(0)}k views</span>
                )}
              </div>

              {lyrics.genius_url && (
                <a href={lyrics.genius_url} target="_blank" rel="noreferrer"
                  style={{ display: "block", marginTop: "12px", fontSize: "12px",
                    color: "#1db954", textDecoration: "none" }}>
                  Read full annotations on Genius ↗
                </a>
              )}
            </>
          )}

          {!loadingLyrics && !lyrics?.found && (
            <p style={{ fontSize: "13px", color: "#444" }}>
              {lyrics?.message || "Could not find this song on Genius."}
            </p>
          )}
        </div>
      )}
    </>
  );
}