import { useState, useEffect, useRef } from "react";
import { C, FONT, TYPE, moodColor, SIDEBAR, GOLD, goldJewel } from "../theme";
import { usePreviewContext } from "../context/PreviewProvider";
import Waveform from "./Waveform";
import CoverButton from "../ui/CoverButton";

const KICKER = { fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase" };
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const fmt = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const moodWord = (v) => (v == null ? "—" : v < 0.3 ? "dark" : v < 0.6 ? "neutral" : "bright");
const pct = (x) => (x != null ? `${Math.round(x * 100)}%` : "—");

// Curated preview stats — only the genuinely interesting ones we actually have.
const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const keyLabel = (f) => (f?.key == null || f.key < 0 ? null : `${NOTES[f.key] || ""} ${f.mode === 0 ? "min" : "maj"}`);
function previewStats(f) {
  if (!f) return [];
  const out = [];
  if (f.tempo) out.push(["BPM", Math.round(f.tempo)]);
  const kl = keyLabel(f); if (kl) out.push(["Key", kl]);
  if (f.energy != null) out.push(["Energy", pct(f.energy)]);
  if (f.valence != null) out.push(["Mood", moodWord(f.valence)]);
  if (f.release_year) out.push(["Year", f.release_year]);
  return out;
}

const goldBtn = (extra = {}) => goldJewel({
  fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.04em",
  fontWeight: 700, cursor: "pointer", borderRadius: 5, ...extra,
});

// variant: "panel" (embedded at the bottom of the spine) | "bar" (mobile bottom bar)
export default function NowPlaying({ variant = "bar" }) {
  const [track, setTrack] = useState(null);
  const [progress, setProgress] = useState(0);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const lastFetchTime = useRef(null);
  const trackRef = useRef(null);
  const { playing: previewId, current: preview, play, stop: stopPreview, analyser } = usePreviewContext();
  const [mixesView, setMixesView] = useState(false);
  const [mixes, setMixes] = useState(null);

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

  useEffect(() => {
    if (!mixesView || !track) return;
    setMixes(null);
    const f = track.features || {};
    const qp = new URLSearchParams({ track: track.name, size: 8 });
    if (track.artist) qp.set("artist", track.artist);
    if (track.track_id) qp.set("spotify_id", track.track_id);
    for (const k of ["energy", "valence", "tempo", "danceability", "acousticness"])
      if (f[k] != null) qp.set(k, f[k]);
    fetch(`${API}/discovery/play-next?${qp}`)
      .then((r) => r.json()).then((d) => setMixes(d.tracks || [])).catch(() => setMixes([]));
  }, [mixesView, track?.track_id]);

  const fetchLyrics = async () => {
    if (!track) return;
    setLoadingLyrics(true); setLyricsOpen(true);
    try {
      const res = await fetch(`${API}/nowplaying/lyrics-meaning?track_name=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`);
      setLyrics(await res.json());
    } catch {}
    setLoadingLyrics(false);
  };

  // A 30s preview takes over the dock — with a live equalizer.
  if (previewId && preview) {
    if (variant === "panel") {
      const stats = previewStats(preview.features);
      return (
        <div style={{ position: "relative", borderTop: `1px solid ${C.border2}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
          {preview.album_art && (
            <div className="kenburns" style={{ position: "absolute", inset: "-30%", backgroundImage: `url(${preview.album_art})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) saturate(1.5)", opacity: 0.26, zIndex: 0 }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,9,11,0.96), rgba(8,9,11,0.58))", zIndex: 0 }} />
          <div style={{ position: "relative", zIndex: 1, padding: 14, flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...KICKER, color: C.silver, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, background: C.green, borderRadius: "50%" }} />Preview
            </div>
            <CoverButton art={preview.album_art} state="playing" onClick={stopPreview} radius={6} iconScale={0.26} persistent />
            <div>
              <div style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2, wordBreak: "break-word" }}>{preview.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{preview.artist}</div>
            </div>
            {stats.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px, 1fr))", gap: "9px 10px", borderTop: `1px solid ${C.border2}`, paddingTop: 11 }}>
                {stats.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: FONT.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{k}</div>
                    <div style={{ fontFamily: FONT.ui, fontSize: 13.5, fontWeight: 700, color: C.ink, marginTop: 2, textTransform: "capitalize" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            <div><Waveform analyser={analyser} active color={C.silver} height={40} bars={36} /></div>
            <button onClick={stopPreview} style={{ width: "100%", padding: 10, borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.ink, fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Stop preview</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,9,11,0.95)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border2}`, zIndex: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px" }}>
          <CoverButton art={preview.album_art} state="playing" onClick={stopPreview} size={40} radius={5} iconScale={0.44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name} <span style={{ color: C.muted, fontWeight: 400 }}>— {preview.artist}</span></div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub, marginTop: 2, textTransform: "uppercase", letterSpacing: "1px" }}>Preview</div>
          </div>
          <div style={{ width: 64, flexShrink: 0 }}><Waveform analyser={analyser} active color={C.silver} height={22} bars={16} /></div>
          <button onClick={stopPreview} aria-label="Stop preview" style={{ padding: "7px 12px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.ink, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>■</button>
        </div>
      </div>
    );
  }

  if (!track) return null;

  const progressPct = Math.min(100, (progress / track.duration_ms) * 100);
  const f = track.features;
  const featRows = f ? [
    ["Tempo", f.tempo != null ? `${Math.round(f.tempo)} BPM` : "—"],
    ["Energy", pct(f.energy)],
    ["Mood", f.valence != null ? `${pct(f.valence)} · ${moodWord(f.valence)}` : "—"],
    ["Danceability", pct(f.danceability)],
    ["Acousticness", pct(f.acousticness)],
    ["Speechiness", pct(f.speechiness)],
  ] : [];

  const popBase = {
    position: "fixed", zIndex: 1300,
    ...(variant === "panel"
      ? { left: SIDEBAR + 14, bottom: 16, width: 320 }
      : { left: 12, right: 12, bottom: 86, maxWidth: 420, marginInline: "auto" }),
    background: C.card, borderRadius: 9, border: `1px solid ${C.border2}`,
    padding: 18, boxShadow: "0 18px 44px rgba(0,0,0,0.6)",
  };

  // ── Audio-stats popover (the silver ⓘ) ──
  const statsPopover = statsOpen && (
    <div className="fade-in" style={popBase}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ ...KICKER, color: C.silver }}>Audio Stats</div>
        <button onClick={() => setStatsOpen(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
      </div>
      {f ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
          {featRows.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px" }}>{k}</div>
              <div style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 700, color: C.ink, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
          No audio analysis for this track yet — ReccoBeats hasn't profiled it. These stats appear once it's enriched.
        </p>
      )}
    </div>
  );

  // ── Genius "what's this about" popover ──
  const popover = lyricsOpen && (
    <div className="fade-in" style={popBase}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loadingLyrics ? "Looking up…" : lyrics?.title || "Song info"}</div>
          <span style={{ fontFamily: FONT.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#111", background: "#FFFF64", padding: "2px 5px", borderRadius: 3, flexShrink: 0 }}>GENIUS</span>
        </div>
        <button onClick={() => { setLyricsOpen(false); setLyrics(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, flexShrink: 0 }}>×</button>
      </div>
      {loadingLyrics && <div style={{ color: C.label, fontSize: 13, fontFamily: FONT.mono }}>Fetching from Genius…</div>}
      {!loadingLyrics && lyrics?.found && (
        <>
          {lyrics.description
            ? <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.65, marginBottom: 14 }}>{lyrics.description}{lyrics.description.length >= 598 && "…"}</p>
            : <p style={{ fontSize: 13, color: C.label }}>No description available yet.</p>}
          <div style={{ display: "flex", gap: 12, fontFamily: FONT.mono, fontSize: 11, color: C.label, borderTop: `1px solid ${C.border2}`, paddingTop: 12, flexWrap: "wrap" }}>
            {lyrics.release_date && <span>Released {lyrics.release_date}</span>}
            {lyrics.annotation_count > 0 && <span>{lyrics.annotation_count} annotations</span>}
            {lyrics.pageviews && <span>{(lyrics.pageviews / 1000).toFixed(0)}k views</span>}
          </div>
          {lyrics.genius_url && (
            <a href={lyrics.genius_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, fontSize: 12, color: C.silver, fontWeight: 700, textDecoration: "underline" }}>Read full annotations on Genius ↗</a>
          )}
        </>
      )}
      {!loadingLyrics && !lyrics?.found && <p style={{ fontSize: 13, color: C.label }}>{lyrics?.message || "Not found on Genius."}</p>}
    </div>
  );

  // ── "Play next" view (panel) ──
  if (variant === "panel" && mixesView) {
    return (
      <div style={{ position: "relative", borderTop: `1px solid ${C.border2}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
        <div style={{ position: "relative", zIndex: 1, padding: 14, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ ...KICKER, color: C.green, display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontSize: 12 }}>✦</span>Plays next</div>
            <button onClick={() => setMixesView(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>Smooth, in-key segues from <b style={{ color: C.ink }}>{track.name}</b> — preview or open, your call.</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
            {mixes === null ? <div style={{ ...TYPE.body, fontSize: 12 }}>Finding smooth transitions…</div>
              : mixes.length ? mixes.map((t) => {
                const isP = previewId === t.id;
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <button onClick={() => play(t.id, t.name, t.artist)} aria-label="Preview"
                      style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${C.border2}`, flexShrink: 0, cursor: "pointer", fontSize: 10, background: isP ? C.silver : "transparent", color: isP ? C.ink2 : C.ink }}>{isP ? "■" : "▶"}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT.ui, fontSize: 12.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}{!t.owned && <span className="gold-shine" style={goldJewel({ fontFamily: FONT.mono, fontSize: 8.5, fontWeight: 700, borderRadius: 3, padding: "1px 4px", marginLeft: 6, verticalAlign: "middle", display: "inline-block" })}>NEW</span>}
                      </div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist} · {t.relation}</div>
                    </div>
                    <a href={t.spotify_url} target="_blank" rel="noreferrer" title="Open in Spotify" style={{ color: C.silver, fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>↗</a>
                  </div>
                );
              }) : <div style={{ ...TYPE.body, fontSize: 12 }}>No in-key matches in your library for this one.</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── PANEL: rich card embedded at the bottom of the spine sidebar ──
  if (variant === "panel") {
    return (
      <div style={{ position: "relative", borderTop: `1px solid ${C.border2}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
        {track.album_art && (
          <div className="kenburns" style={{ position: "absolute", inset: "-30%", backgroundImage: `url(${track.album_art})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) saturate(1.6)", opacity: 0.28, zIndex: 0 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,9,11,0.96), rgba(8,9,11,0.55))", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, padding: 14, flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ ...KICKER, color: C.ink, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, background: C.green, borderRadius: "50%" }} />Now Playing
            </div>
            <button onClick={() => setStatsOpen((o) => !o)} aria-label="Audio stats"
              style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${C.silver}`, background: statsOpen ? C.silver : "transparent", color: statsOpen ? C.ink2 : C.silver, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>i</button>
          </div>

          {/* Album art with progress + IN LIBRARY badge (capped height so it never clips the dock) */}
          <div style={{ position: "relative", borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border2}`, boxShadow: "0 8px 22px rgba(0,0,0,0.5)", maxHeight: 184 }}>
            {track.album_art
              ? <img src={track.album_art} alt="" style={{ width: "100%", display: "block", aspectRatio: "1 / 1", objectFit: "cover" }} />
              : <div style={{ width: "100%", aspectRatio: "1 / 1", background: C.card2 }} />}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.4)" }}>
              <div style={{ height: 3, background: GOLD, width: `${progressPct}%`, transition: "width 1s linear" }} />
            </div>
            {track.in_library && (
              <span className="gold-shine" style={goldJewel({ position: "absolute", top: 8, left: 8, fontFamily: FONT.mono, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 3, letterSpacing: "0.5px", display: "inline-flex", alignItems: "center", gap: 4 })}>✦ In Library</span>
            )}
          </div>

          {/* Title / artist / album — below the art so it wraps in FULL (no cutoff) */}
          <div style={{ marginTop: 11 }}>
            <div style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.22, wordBreak: "break-word" }}>{track.name}</div>
            <div style={{ fontFamily: FONT.ui, fontSize: 12.5, color: C.sub, marginTop: 3, wordBreak: "break-word" }}>{track.artist}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, marginTop: 5, textTransform: "uppercase", letterSpacing: "0.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.album} · {fmt(progress)} / {fmt(track.duration_ms)}</div>
          </div>

          <div style={{ marginTop: 12, height: 32 }}><Waveform features={f} color={C.silver} height={32} bars={46} /></div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
            <button onClick={() => setMixesView(true)} className="gold-shine" style={goldBtn({ width: "100%", padding: "11px 8px", fontSize: 11.5, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 })}>⇆ Play Next ✦</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={fetchLyrics} style={{ flex: 1, padding: "9px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: lyricsOpen ? C.silver : "transparent", color: lyricsOpen ? C.ink2 : C.ink, fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.03em", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>What's this about?</button>
              <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ padding: "9px 13px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.ink, fontSize: 12, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center" }}>↗</a>
            </div>
          </div>
        </div>
        {statsPopover}
        {popover}
      </div>
    );
  }

  // ── BAR: compact bottom bar (mobile) ──
  return (
    <>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,9,11,0.95)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border2}`, zIndex: 1000 }}>
        <div style={{ height: 2, background: C.border2 }}>
          <div style={{ height: 2, background: GOLD, width: `${progressPct}%`, transition: "width 1s linear" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px" }}>
          {track.album_art && <img src={track.album_art} alt="" style={{ width: 40, height: 40, borderRadius: 5, flexShrink: 0, border: `1px solid ${C.border2}` }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {track.name} <span style={{ color: C.muted, fontWeight: 400 }}>— {track.artist}</span>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fmt(progress)} / {fmt(track.duration_ms)} · {track.album}
            </div>
          </div>
          <button onClick={() => setStatsOpen((o) => !o)} aria-label="Audio stats" style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${C.silver}`, background: statsOpen ? C.silver : "transparent", color: statsOpen ? C.ink2 : C.silver, fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>i</button>
          <button onClick={fetchLyrics} aria-label="What's this about?" style={{ padding: "7px 11px", borderRadius: 5, border: `1px solid ${C.border2}`, background: lyricsOpen ? C.silver : "transparent", color: lyricsOpen ? C.ink2 : C.ink, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>?</button>
          <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ padding: "7px 11px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "transparent", color: C.ink, fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>↗</a>
        </div>
      </div>
      {statsPopover}
      {popover}
    </>
  );
}
