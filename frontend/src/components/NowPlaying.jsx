import { useState, useEffect, useRef } from "react";
import { C, FONT, moodColor, SIDEBAR } from "../theme";
import Waveform from "./Waveform";
import { usePreviewContext } from "../context/PreviewProvider";

const KICKER = { fontFamily: FONT.body, fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase" };

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const fmt = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const moodWord = (v) => (v < 0.3 ? "dark" : v < 0.6 ? "neutral" : "happy");

// variant: "panel" (embedded at the bottom of the spine) | "bar" (mobile bottom bar)
export default function NowPlaying({ variant = "bar" }) {
  const [track, setTrack] = useState(null);
  const [progress, setProgress] = useState(0);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [lyricsView, setLyricsView] = useState(false);
  const [lyricLines, setLyricLines] = useState(null);   // null=loading, []=none, [...]=synced
  const [lyricIdx, setLyricIdx] = useState(0);
  const [plainLyrics, setPlainLyrics] = useState("");
  const lastFetchTime = useRef(null);
  const trackRef = useRef(null);
  const { playing: previewId, current: preview, analyser, stop: stopPreview } = usePreviewContext();

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/nowplaying/current`);
        const data = await res.json();
        if (data.playing) {
          setTrack(data); trackRef.current = data;
          setProgress(data.progress_ms); lastFetchTime.current = Date.now();
        } else { setTrack(null); trackRef.current = null; }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      if (!trackRef.current || !lastFetchTime.current) return;
      const next = trackRef.current.progress_ms + (Date.now() - lastFetchTime.current);
      if (next <= trackRef.current.duration_ms) setProgress(next);
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Fetch synced lyrics when the lyrics view opens (or the track changes).
  useEffect(() => {
    if (!lyricsView || !track) return;
    setLyricLines(null); setPlainLyrics("");
    fetch(`${API}/nowplaying/synced-lyrics?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}&duration=${Math.round((track.duration_ms || 0) / 1000)}`)
      .then((r) => r.json())
      .then((d) => { setLyricLines(d.lines || []); setPlainLyrics(d.plain || ""); })
      .catch(() => setLyricLines([]));
  }, [lyricsView, track?.name]);

  // Advance the active lyric line against the track's real position.
  useEffect(() => {
    if (!lyricsView || !lyricLines?.length) return;
    const id = setInterval(() => {
      const tr = trackRef.current;
      if (!tr) return;
      const sec = (tr.progress_ms + (Date.now() - (lastFetchTime.current || Date.now()))) / 1000;
      let i = 0;
      for (let k = 0; k < lyricLines.length; k++) { if (lyricLines[k].t <= sec) i = k; else break; }
      setLyricIdx(i);
    }, 250);
    return () => clearInterval(id);
  }, [lyricsView, lyricLines]);

  const fetchLyrics = async () => {
    if (!track) return;
    setLoadingLyrics(true); setLyricsOpen(true);
    try {
      const res = await fetch(`${API}/nowplaying/lyrics-meaning?track_name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`);
      setLyrics(await res.json());
    } catch {}
    setLoadingLyrics(false);
  };

  // A 30s preview (triggered anywhere in the app) takes over the dock with the
  // live, audio-reactive waveform — this is the "where does the big waveform live"
  // answer: same spot as the Spotify now-playing.
  if (previewId && preview) {
    const pv = preview.features?.valence;
    const wave = (d) => (
      <Waveform size={d} active analyser={analyser}
        valence={pv} features={preview.features} seed={preview.id || preview.name} />
    );
    if (variant === "panel") {
      return (
        <div style={{ position: "relative", borderTop: `1px solid ${C.border}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 40%, rgba(29,185,84,0.13), rgba(8,8,8,0.98))", zIndex: 0 }} />
          <div style={{ position: "relative", zIndex: 1, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <div style={{ ...KICKER, color: C.green, alignSelf: "flex-start" }}>Preview</div>
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>{wave(184)}</div>
            <div style={{ textAlign: "center", width: "100%" }}>
              <div style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name}</div>
              <div style={{ fontSize: 12, color: "#cdcdcd", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.artist}</div>
            </div>
            <button onClick={stopPreview} style={{ width: "100%", padding: 10, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.09)", color: "#e6e6e6", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>■ Stop preview</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, zIndex: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px" }}>
          <div style={{ width: 42, height: 42, flexShrink: 0 }}>{wave(42)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name} <span style={{ color: C.muted, fontWeight: 400 }}>— {preview.artist}</span></div>
            <div style={{ fontSize: 10.5, color: C.green, marginTop: 2 }}>Preview</div>
          </div>
          <button onClick={stopPreview} aria-label="Stop preview" style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#1a1a1a", color: C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>■</button>
        </div>
      </div>
    );
  }

  if (!track) return null;

  const progressPct = Math.min(100, (progress / track.duration_ms) * 100);
  const f = track.features;

  // ── Genius "what's this about" popover (shared) ──
  const popover = lyricsOpen && (
    <div
      className="fade-in"
      style={{
        position: "fixed", zIndex: 1300,
        ...(variant === "panel"
          ? { left: SIDEBAR + 14, bottom: 16, width: 340 }
          : { left: 12, right: 12, bottom: 86, maxWidth: 420, marginInline: "auto" }),
        background: "#121212", borderRadius: 16, border: `1px solid ${C.border}`,
        padding: 22, boxShadow: "0 16px 50px rgba(0,0,0,0.7)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{loadingLyrics ? "Looking up…" : lyrics?.title || "Song info"}</div>
        <button onClick={() => { setLyricsOpen(false); setLyrics(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {loadingLyrics && <div style={{ color: C.label, fontSize: 13 }}>Fetching from Genius…</div>}
      {!loadingLyrics && lyrics?.found && (
        <>
          {lyrics.description
            ? <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.65, marginBottom: 14 }}>{lyrics.description}{lyrics.description.length >= 598 && "…"}</p>
            : <p style={{ fontSize: 13, color: C.label }}>No description available yet.</p>}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.label, borderTop: `1px solid ${C.border}`, paddingTop: 12, flexWrap: "wrap" }}>
            {lyrics.release_date && <span>Released {lyrics.release_date}</span>}
            {lyrics.annotation_count > 0 && <span>{lyrics.annotation_count} annotations</span>}
            {lyrics.pageviews && <span>{(lyrics.pageviews / 1000).toFixed(0)}k views</span>}
          </div>
          {lyrics.genius_url && (
            <a href={lyrics.genius_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, fontSize: 12, color: C.green, textDecoration: "none" }}>Read full annotations on Genius ↗</a>
          )}
        </>
      )}
      {!loadingLyrics && !lyrics?.found && <p style={{ fontSize: 13, color: C.label }}>{lyrics?.message || "Not found on Genius."}</p>}
    </div>
  );

  // ── Synced lyrics view (panel) — story-style, lines advance with the song ──
  if (variant === "panel" && lyricsView) {
    return (
      <div style={{ position: "relative", borderTop: `1px solid ${C.border}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {track.album_art && (
          <div className="kenburns" style={{ position: "absolute", inset: "-30%", backgroundImage: `url(${track.album_art})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(34px) brightness(0.4) saturate(1.3)", opacity: 0.5, zIndex: 0 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(8,8,8,0.72), rgba(8,8,8,0.96))", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ ...KICKER, color: C.green }}>Lyrics</div>
            <button onClick={() => setLyricsView(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 11, overflow: "hidden" }}>
            {lyricLines === null ? (
              <div style={{ ...TYPE.body, fontSize: 13 }}>Finding lyrics…</div>
            ) : lyricLines.length ? (
              [-1, 0, 1, 2, 3].map((off) => {
                const line = lyricLines[lyricIdx + off];
                if (!line) return null;
                const cur = off === 0;
                return (
                  <div key={lyricIdx + off} style={{ fontFamily: FONT.display, fontSize: cur ? 17 : 13, fontWeight: cur ? 700 : 500, color: cur ? "#fff" : "rgba(255,255,255,0.38)", lineHeight: 1.3, transition: "all 0.3s ease" }}>
                    {line.text}
                  </div>
                );
              })
            ) : plainLyrics ? (
              <div style={{ fontSize: 12.5, color: "#bbb", lineHeight: 1.75, overflowY: "auto", whiteSpace: "pre-wrap" }}>{plainLyrics}</div>
            ) : (
              <div style={{ ...TYPE.body, fontSize: 13 }}>No lyrics found for this one.</div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#cdcdcd", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lyricLines && !lyricLines.length && plainLyrics ? "Unsynced — full lyric" : `${track.name} · ${track.artist}`}
          </div>
        </div>
      </div>
    );
  }

  // ── PANEL: rich card embedded at the bottom of the spine sidebar ──
  if (variant === "panel") {
    return (
      <div style={{ position: "relative", borderTop: `1px solid ${C.border}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {/* Animated, blurred album-art backdrop — fills the sidebar as an ambient glow */}
        {track.album_art && (
          <div
            className="kenburns"
            style={{
              position: "absolute", inset: "-30%", backgroundImage: `url(${track.album_art})`,
              backgroundSize: "cover", backgroundPosition: "center",
              filter: "blur(30px) brightness(0.55) saturate(1.3)", opacity: 0.5, zIndex: 0,
            }}
          />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,8,8,0.45), rgba(8,8,8,0.98))", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, padding: 14 }}>
          <div style={{ fontFamily: FONT.body, fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: C.green, marginBottom: 10 }}>Now Playing</div>
          {/* Album art with progress + title/artist overlay */}
          <div style={{ position: "relative", borderRadius: 11, overflow: "hidden", boxShadow: "0 10px 28px rgba(0,0,0,0.55)" }}>
            {track.album_art
              ? <img src={track.album_art} alt="" style={{ width: "100%", display: "block", aspectRatio: "1 / 1", objectFit: "cover" }} />
              : <div style={{ width: "100%", aspectRatio: "1 / 1", background: C.card2 }} />}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.35)" }}>
              <div style={{ height: 3, background: C.green, width: `${progressPct}%`, transition: "width 1s linear" }} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "30px 12px 11px", background: "linear-gradient(transparent, rgba(0,0,0,0.92))" }}>
              {track.in_library && (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: "rgba(13,43,24,0.85)", padding: "2px 6px", borderRadius: 4, marginBottom: 5, display: "inline-block" }}>IN LIBRARY</span>
              )}
              <div style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.name}</div>
              <div style={{ fontSize: 12, color: "#cdcdcd", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist}</div>
            </div>
          </div>

          {/* Album + custom stats below the art */}
          <div style={{ fontSize: 11, color: C.sub, marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.album}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 6, fontSize: 10.5, color: C.muted }}>
            <span>{fmt(progress)} / {fmt(track.duration_ms)}</span>
            {f && <>
              <span>{Math.round(f.tempo)} BPM</span>
              <span style={{ color: moodColor(f.valence) }}>{moodWord(f.valence)}</span>
              <span>{Math.round(f.energy * 100)}% energy</span>
            </>}
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...KICKER, color: C.muted, fontSize: 9, marginBottom: 8, alignSelf: "flex-start" }}>Sonic signature</div>
            <Waveform size={104} active={false} features={f} valence={f?.valence} seed={track.name} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            <button onClick={() => setLyricsView(true)} style={{ width: "100%", padding: "9px 8px", borderRadius: 9, border: `1px solid ${C.greenBd}`, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>♫ Lyrics</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={fetchLyrics} style={{ flex: 1, padding: "8px 8px", borderRadius: 9, border: "none", background: lyricsOpen ? C.green : "rgba(255,255,255,0.09)", color: lyricsOpen ? "#000" : "#e6e6e6", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>What's this about?</button>
              <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ padding: "8px 13px", borderRadius: 9, background: "rgba(255,255,255,0.09)", color: "#e6e6e6", fontSize: 12, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center" }}>↗</a>
            </div>
          </div>
        </div>
        {popover}
      </div>
    );
  }

  // ── BAR: compact bottom bar (mobile) ──
  return (
    <>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, zIndex: 1000 }}>
        <div style={{ height: 2, background: "#111" }}>
          <div style={{ height: 2, background: C.green, width: `${progressPct}%`, transition: "width 1s linear" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px" }}>
          {track.album_art && <img src={track.album_art} alt="" style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {track.name} <span style={{ color: C.muted, fontWeight: 400 }}>— {track.artist}</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fmt(progress)} / {fmt(track.duration_ms)} · {track.album}
            </div>
          </div>
          <button onClick={fetchLyrics} aria-label="What's this about?" style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: lyricsOpen ? C.green : "#1a1a1a", color: lyricsOpen ? "#000" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>ⓘ</button>
          <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ padding: "7px 11px", borderRadius: 8, background: "#1a1a1a", color: C.sub, fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>↗</a>
        </div>
      </div>
      {popover}
    </>
  );
}
