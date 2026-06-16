import { useState, useEffect, useCallback } from "react";
import usePreview from "../hooks/usePreview";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg: "#080808", card: "#0e0e0e", card2: "#111",
  border: "#1a1a1a", green: "#1db954", greenBg: "#0d2b18", greenBd: "#1a4a2a",
  amber: "#f59e0b", indigo: "#6366f1", muted: "#555", sub: "#888", label: "#444",
};

const moodColor = (v) => v == null ? C.muted : v < 0.35 ? C.indigo : v < 0.6 ? C.amber : C.green;

function MonthCard({ m, onAdded }) {
  const [open,    setOpen]    = useState(false);
  const [tracks,  setTracks]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [result,  setResult]  = useState(null);
  const { playing, play } = usePreview();

  const loadTracks = useCallback(async () => {
    if (tracks) return;
    setLoading(true);
    const r = await fetch(`${API}/library/month-tracks?year=${m.year}&month=${m.month}`);
    const d = await r.json();
    setTracks(d.tracks || []);
    setLoading(false);
  }, [m.year, m.month, tracks]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadTracks();
  };

  const addToSpotify = async (e) => {
    e.stopPropagation();
    setAdding(true);
    setResult(null);
    const r = await fetch(
      `${API}/library/monthly-playlists/create?year=${m.year}&month=${m.month}`,
      { method: "POST" }
    );
    const d = await r.json();
    setResult(d);
    setAdding(false);
    if (d.success) onAdded(m.year, m.month, d.playlist_url);
  };

  const inSpotify = m.in_spotify || result?.success;
  const url       = m.playlist_url || result?.playlist_url;

  return (
    <div style={{ background: C.card, border: `1px solid ${open ? C.greenBd : C.border}`,
      borderRadius: "12px", overflow: "hidden", transition: "border-color 0.15s" }}>

      {/* Header row */}
      <div onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: "14px",
          padding: "16px 18px", cursor: "pointer" }}>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff" }}>
            {m.month_name} {m.year}
          </div>
          <div style={{ fontSize: "12px", color: C.muted, marginTop: "3px",
            display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{m.track_count} songs</span>
            <span>·</span>
            <span>{m.unique_artists} artists</span>
            {m.avg_tempo ? <><span>·</span><span>{m.avg_tempo} BPM</span></> : null}
            {m.avg_valence != null && (
              <><span>·</span>
              <span style={{ color: moodColor(m.avg_valence) }}>
                {m.avg_valence < 0.35 ? "dark" : m.avg_valence < 0.6 ? "neutral" : "bright"}
              </span></>
            )}
          </div>
        </div>

        {/* energy mini-bar */}
        {m.avg_energy != null && (
          <div style={{ width: "60px", flexShrink: 0 }} title={`avg energy ${Math.round(m.avg_energy*100)}%`}>
            <div style={{ height: "4px", background: "#1a1a1a", borderRadius: "2px" }}>
              <div style={{ height: "4px", borderRadius: "2px", background: C.green,
                width: `${Math.round(m.avg_energy * 100)}%` }} />
            </div>
          </div>
        )}

        {inSpotify ? (
          <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ padding: "7px 14px", borderRadius: "9px", background: C.greenBg,
              color: C.green, border: `1px solid ${C.greenBd}`, fontSize: "12px",
              fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
            ✓ In Spotify ↗
          </a>
        ) : (
          <button onClick={addToSpotify} disabled={adding}
            style={{ padding: "7px 14px", borderRadius: "9px", border: "none",
              background: C.green, color: "#000", fontSize: "12px", fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              opacity: adding ? 0.6 : 1 }}>
            {adding ? "Adding..." : "+ Add to Spotify"}
          </button>
        )}

        <span style={{ color: C.muted, fontSize: "12px", flexShrink: 0,
          transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
      </div>

      {result && !result.success && (
        <div style={{ padding: "0 18px 12px", fontSize: "12px", color: "#ef4444" }}>
          {result.message}
        </div>
      )}

      {/* Expanded track list */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px" }}>
          {loading ? (
            <div style={{ padding: "20px", textAlign: "center", color: C.muted,
              fontSize: "13px" }}>Loading...</div>
          ) : (tracks || []).length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: C.muted,
              fontSize: "13px" }}>No tracks.</div>
          ) : (
            tracks.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 12px", borderRadius: "8px",
                background: playing === t.id ? C.greenBg : "transparent" }}>
                <button onClick={() => play(t.id, t.name, t.artist)}
                  style={{ width: "28px", height: "28px", borderRadius: "50%", border: "none",
                    background: playing === t.id ? C.green : "#1a1a1a",
                    color: playing === t.id ? "#000" : C.muted, cursor: "pointer",
                    fontSize: "10px", flexShrink: 0 }}>
                  {playing === t.id ? "■" : "▶"}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.artist}
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: C.label, flexShrink: 0 }}>
                  {t.saved_at}
                </span>
                {t.language && t.language !== "english" && (
                  <span style={{ fontSize: "11px", color: C.amber, background: "#1a1200",
                    padding: "2px 7px", borderRadius: "10px", flexShrink: 0 }}>
                    {t.language}
                  </span>
                )}
                <a href={t.spotify_url} target="_blank" rel="noreferrer"
                  style={{ color: "#2a2a2a", textDecoration: "none", fontSize: "13px",
                    flexShrink: 0 }}>↗</a>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function MonthlyRewind() {
  const [months,  setMonths]  = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/library/monthly-rewind`);
    const d = await r.json();
    setMonths(d.months || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAdded = (year, month, url) => {
    setMonths(prev => prev.map(m =>
      m.year === year && m.month === month
        ? { ...m, in_spotify: true, playlist_url: url } : m
    ));
  };

  // Group by year
  const byYear = {};
  (months || []).forEach(m => { (byYear[m.year] = byYear[m.year] || []).push(m); });
  const years = Object.keys(byYear).sort((a, b) => b - a);

  const addedCount = (months || []).filter(m => m.in_spotify).length;

  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: C.green, margin: 0 }}>
          Monthly Rewind
        </h1>
        <p style={{ color: C.muted, fontSize: "14px", margin: "6px 0 0" }}>
          Every month of your saves, as a playlist. Browse them here — add the ones
          you want to your Spotify with one tap. Nothing is pushed automatically.
        </p>
        {months && (
          <div style={{ fontSize: "12px", color: C.sub, marginTop: "10px" }}>
            {months.length} months · {addedCount} added to Spotify
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: C.muted }}>Loading...</div>
      ) : (
        years.map(year => (
          <div key={year} style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: C.label,
              letterSpacing: "1px", marginBottom: "12px" }}>{year}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {byYear[year].map(m => (
                <MonthCard key={`${m.year}-${m.month}`} m={m} onAdded={markAdded} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
