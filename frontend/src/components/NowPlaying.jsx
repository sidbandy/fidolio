import { useState, useEffect, useRef } from "react";
import useMediaQuery from "../hooks/useMediaQuery";
import { SIDEBAR, MOBILE_Q } from "./Spine";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function NowPlaying() {
  const [track, setTrack]           = useState(null);
  const [progress, setProgress]     = useState(0);
  const [lyrics, setLyrics]         = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const lastFetchTime = useRef(null);
  const trackRef      = useRef(null);

  // Poll Spotify every 30s for real position
  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch(`${API}/nowplaying/current`);
        const data = await res.json();
        if (data.playing) {
          setTrack(data);
          trackRef.current  = data;
          setProgress(data.progress_ms);
          lastFetchTime.current = Date.now();
        } else {
          setTrack(null);
          trackRef.current = null;
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  // Advance progress bar every second locally
  useEffect(() => {
    const tick = setInterval(() => {
      if (!trackRef.current || !lastFetchTime.current) return;
      const elapsed = Date.now() - lastFetchTime.current;
      const newProgress = trackRef.current.progress_ms + elapsed;
      if (newProgress <= trackRef.current.duration_ms) {
        setProgress(newProgress);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const fetchLyrics = async () => {
    if (!track) return;
    setLoadingLyrics(true);
    setLyricsOpen(true);
    try {
      const res  = await fetch(
        `${API}/nowplaying/lyrics-meaning?track_name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`
      );
      setLyrics(await res.json());
    } catch {}
    setLoadingLyrics(false);
  };

  const isMobile = useMediaQuery(MOBILE_Q);

  if (!track) return null;

  const progressPct = Math.min(100, (progress / track.duration_ms) * 100);

  const moodColor = (v) => {
    if (!v) return "#555";
    if (v < 0.3) return "#6366f1";
    if (v < 0.6) return "#f59e0b";
    return "#1db954";
  };

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <>
      <div style={{
        position: "fixed", bottom: 0, left: isMobile ? 0 : SIDEBAR, right: 0,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderTop: "1px solid #1a1a1a", zIndex: 1000,
      }}>
        {/* Progress bar — sits at very top of the bar */}
        <div style={{ height: "2px", background: "#111" }}>
          <div style={{
            height: "2px", background: "#1db954",
            width: `${progressPct}%`, transition: "width 1s linear"
          }} />
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: "16px",
          padding: "10px 32px"
        }}>
          {track.album_art && (
            <img src={track.album_art} alt="album" style={{
              width: "42px", height: "42px", borderRadius: "6px", flexShrink: 0
            }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "14px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "220px" }}>
                {track.name}
              </span>
              <span style={{ color: "#555", fontSize: "13px", whiteSpace: "nowrap" }}>
                — {track.artist}
              </span>
              {track.in_library && (
                <span style={{ fontSize: "10px", color: "#1db954",
                  background: "#0d2b18", padding: "2px 6px",
                  borderRadius: "4px", flexShrink: 0 }}>
                  IN LIBRARY
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "#333", marginTop: "3px" }}>
              {fmt(progress)} / {fmt(track.duration_ms)} · {track.album}
            </div>
          </div>

          {track.features && (
            <div style={{ display: "flex", gap: "16px",
              fontSize: "11px", color: "#444", flexShrink: 0 }}>
              <span>{Math.round(track.features.tempo)} BPM</span>
              <span style={{ color: moodColor(track.features.valence) }}>
                {track.features.valence < 0.3 ? "dark"
                  : track.features.valence < 0.6 ? "neutral" : "happy"}
              </span>
              <span>{Math.round(track.features.energy * 100)}% energy</span>
            </div>
          )}

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
      </div>

      {lyricsOpen && (
        <div style={{
          position: "fixed", bottom: "72px", right: "32px",
          width: "360px", background: "#111", borderRadius: "16px",
          border: "1px solid #1a1a1a", padding: "24px", zIndex: 999,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>
              {loadingLyrics ? "Looking up..." : lyrics?.title || "Song info"}
            </div>
            <button onClick={() => { setLyricsOpen(false); setLyrics(null); }} style={{
              background: "none", border: "none",
              color: "#555", cursor: "pointer", fontSize: "20px"
            }}>×</button>
          </div>

          {loadingLyrics && (
            <div style={{ color: "#444", fontSize: "13px" }}>Fetching from Genius...</div>
          )}

          {!loadingLyrics && lyrics?.found && (
            <>
              {lyrics.description
                ? <p style={{ fontSize: "13px", color: "#aaa",
                    lineHeight: 1.65, marginBottom: "16px" }}>
                    {lyrics.description}{lyrics.description.length >= 598 && "..."}
                  </p>
                : <p style={{ fontSize: "13px", color: "#444" }}>
                    No description available yet.
                  </p>
              }
              <div style={{ display: "flex", gap: "12px", fontSize: "11px",
                color: "#444", borderTop: "1px solid #1a1a1a", paddingTop: "12px",
                flexWrap: "wrap" }}>
                {lyrics.release_date && <span>Released {lyrics.release_date}</span>}
                {lyrics.annotation_count > 0 && <span>{lyrics.annotation_count} annotations</span>}
                {lyrics.pageviews && <span>{(lyrics.pageviews/1000).toFixed(0)}k views</span>}
              </div>
              {lyrics.genius_url && (
                <a href={lyrics.genius_url} target="_blank" rel="noreferrer"
                  style={{ display: "block", marginTop: "12px",
                    fontSize: "12px", color: "#1db954", textDecoration: "none" }}>
                  Read full annotations on Genius ↗
                </a>
              )}
            </>
          )}

          {!loadingLyrics && !lyrics?.found && (
            <p style={{ fontSize: "13px", color: "#444" }}>
              {lyrics?.message || "Not found on Genius."}
            </p>
          )}
        </div>
      )}
    </>
  );
}