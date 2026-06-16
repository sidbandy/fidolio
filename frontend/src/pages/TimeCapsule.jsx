import { useState, useEffect, useMemo } from "react";
import usePreview from "../hooks/usePreview";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const moodColor = (v) => {
  if (!v) return "#444";
  if (v < 0.3) return "#6366f1";
  if (v < 0.6) return "#f59e0b";
  return "#1db954";
};

const key = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

export default function TimeCapsule() {
  const [allMonths,  setAllMonths]  = useState([]);   // from /monthly-rewind
  const [year,       setYear]       = useState(new Date().getFullYear());
  const [selected,   setSelected]   = useState(new Set()); // Set of "YYYY-MM"
  const [preview,    setPreview]    = useState(null);
  const [loadingPrev,setLoadingPrev]= useState(false);
  const [creating,   setCreating]   = useState(false);
  const [result,     setResult]     = useState(null);
  const [sortBy,     setSortBy]     = useState("saved_at");
  const { playing, play } = usePreview();

  // Load every month's count once (real data — all 69 months)
  useEffect(() => {
    fetch(`${API}/library/monthly-rewind`)
      .then(r => r.json())
      .then(d => {
        setAllMonths(d.months || []);
        if (d.months?.length) setYear(d.months[0].year); // newest year
      })
      .catch(() => {});
  }, []);

  // counts keyed by "YYYY-MM"
  const countMap = useMemo(() => {
    const m = {};
    allMonths.forEach(x => { m[key(x.year, x.month)] = x.track_count; });
    return m;
  }, [allMonths]);

  const years = useMemo(
    () => [...new Set(allMonths.map(m => m.year))].sort((a, b) => b - a),
    [allMonths]
  );

  const toggleMonth = (y, m) => {
    if (!countMap[key(y, m)]) return; // no saves that month
    setSelected(prev => {
      const next = new Set(prev);
      const k = key(y, m);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
    setPreview(null); setResult(null);
  };

  const selectedSorted = useMemo(
    () => [...selected].sort(),
    [selected]
  );
  const selectedSongTotal = selectedSorted.reduce((s, k) => s + (countMap[k] || 0), 0);

  const rangeLabel = () => {
    if (selectedSorted.length === 0) return "No months selected";
    if (selectedSorted.length === 1) {
      const [y, m] = selectedSorted[0].split("-");
      return `${MONTHS[+m - 1]} ${y}`;
    }
    const fmt = k => { const [y, m] = k.split("-"); return `${ABBR[+m - 1]} ${y}`; };
    return `${fmt(selectedSorted[0])} → ${fmt(selectedSorted[selectedSorted.length - 1])} · ${selectedSorted.length} months`;
  };

  const loadPreview = async () => {
    if (!selectedSorted.length) return;
    setLoadingPrev(true); setPreview(null); setResult(null);
    try {
      const r = await fetch(`${API}/library/range-tracks?months=${selectedSorted.join(",")}`);
      const d = await r.json();
      setPreview(d.tracks || []);
    } catch (e) { console.error(e); }
    setLoadingPrev(false);
  };

  const createPlaylist = async () => {
    if (!preview?.length) return;
    setCreating(true);
    try {
      const r = await fetch(
        `${API}/library/multi-month-playlist?months=${selectedSorted.join(",")}`,
        { method: "POST" }
      );
      setResult(await r.json());
    } catch (e) { setResult({ success: false, message: String(e) }); }
    setCreating(false);
  };

  const sortTracks = (tracks) => {
    if (!tracks) return [];
    const s = [...tracks];
    switch (sortBy) {
      case "energy":       return s.sort((a, b) => (b.energy || 0) - (a.energy || 0));
      case "valence":      return s.sort((a, b) => (b.valence || 0) - (a.valence || 0));
      case "tempo":        return s.sort((a, b) => (b.tempo || 0) - (a.tempo || 0));
      case "artist":       return s.sort((a, b) => a.artist.localeCompare(b.artist));
      case "release_year": return s.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      default:             return s.sort((a, b) => b.saved_at?.localeCompare(a.saved_at));
    }
  };
  const sorted = sortTracks(preview);

  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;

  return (
    <div style={{ padding: "40px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Monthly Rewind
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "36px" }}>
        Every song you saved, by month. Pick one month — or a span of months — and
        turn it into a single Spotify playlist. A perfect archive of who you were.
      </p>

      {/* Year + Month picker */}
      <div className="card" style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Year tabs */}
          <div>
            <div className="label" style={{ marginBottom: "10px" }}>Year</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", maxWidth: "120px" }}>
              {years.map(y => (
                <button key={y} onClick={() => setYear(y)} style={{
                  padding: "6px 14px", borderRadius: "14px", border: "none",
                  background: year === y ? "#1db954" : "#151515",
                  color: year === y ? "#000" : "#666",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer"
                }}>{y}</button>
              ))}
            </div>
          </div>

          {/* Month grid — multi-select, persists across years */}
          <div style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: "10px" }}>
              Months <span style={{ color: "#444", fontWeight: 400, textTransform: "none" }}>
                — tap to select one or several (across years too)
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px" }}>
              {MONTHS.map((mName, i) => {
                const num = i + 1;
                const k = key(year, num);
                const count = countMap[k] || 0;
                const isSel = selected.has(k);
                const isFuture = year === thisYear && num > thisMonth;
                const disabled = isFuture || count === 0;
                return (
                  <button key={mName} onClick={() => toggleMonth(year, num)} disabled={disabled}
                    title={count ? `${count} songs` : "no saves"}
                    style={{
                      padding: "8px 4px", borderRadius: "10px",
                      border: `1px solid ${isSel ? "#1db954" : "transparent"}`,
                      background: isSel ? "#0d2b18" : "#151515",
                      color: disabled ? "#2a2a2a" : isSel ? "#1db954" : "#888",
                      fontSize: "12px", fontWeight: 600,
                      cursor: disabled ? "default" : "pointer", textAlign: "center",
                      lineHeight: 1.3
                    }}>
                    <div>{mName.slice(0, 3)}</div>
                    <div style={{ fontSize: "10px", color: disabled ? "#222" : isSel ? "#1db954" : "#444" }}>
                      {count || "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selection summary */}
        <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #1a1a1a",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "18px", fontWeight: 700 }}>{rangeLabel()}</span>
            {selectedSongTotal > 0 && (
              <span style={{ color: "#555", fontSize: "14px", marginLeft: "12px" }}>
                {selectedSongTotal} songs total
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {selected.size > 0 && (
              <button onClick={() => { setSelected(new Set()); setPreview(null); setResult(null); }}
                style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid #1a1a1a",
                  background: "#151515", color: "#666", fontSize: "13px", cursor: "pointer" }}>
                Clear
              </button>
            )}
            <button onClick={loadPreview} disabled={loadingPrev || selected.size === 0} style={{
              padding: "10px 24px", borderRadius: "10px", border: "none",
              background: (loadingPrev || selected.size === 0) ? "#1a1a1a" : "#1db954",
              color: (loadingPrev || selected.size === 0) ? "#555" : "#000",
              fontWeight: 700, fontSize: "14px",
              cursor: (loadingPrev || selected.size === 0) ? "default" : "pointer"
            }}>
              {loadingPrev ? "Loading..." : "Preview Songs →"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      {preview !== null && !loadingPrev && (
        <div>
          {preview.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px", color: "#555" }}>
              No songs in the selected months.
            </div>
          ) : (
            <>
              {/* Sort + create */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px",
                alignItems: "center", flexWrap: "wrap" }}>
                <span className="label" style={{ marginRight: "4px" }}>Sort</span>
                {[
                  { v: "saved_at", l: "Save Date" }, { v: "energy", l: "Energy" },
                  { v: "valence", l: "Mood" }, { v: "tempo", l: "BPM" },
                  { v: "artist", l: "Artist" }, { v: "release_year", l: "Release Year" },
                ].map(s => (
                  <button key={s.v} onClick={() => setSortBy(s.v)} style={{
                    padding: "5px 12px", borderRadius: "14px", border: "none",
                    background: sortBy === s.v ? "#1db954" : "#151515",
                    color: sortBy === s.v ? "#000" : "#666",
                    fontSize: "12px", fontWeight: 600, cursor: "pointer"
                  }}>{s.l}</button>
                ))}
                <div style={{ marginLeft: "auto" }}>
                  {result?.success ? (
                    <a href={result.playlist_url} target="_blank" rel="noreferrer"
                      style={{ padding: "8px 20px", borderRadius: "10px", background: "#1db954",
                        color: "#000", fontWeight: 700, fontSize: "13px", textDecoration: "none" }}>
                      Open in Spotify ↗
                    </a>
                  ) : (
                    <button onClick={createPlaylist} disabled={creating} style={{
                      padding: "8px 20px", borderRadius: "10px", border: "none",
                      background: creating ? "#1a1a1a" : "#1db954",
                      color: creating ? "#555" : "#000",
                      fontWeight: 700, fontSize: "13px", cursor: creating ? "default" : "pointer"
                    }}>
                      {creating ? "Creating..." : `Create Spotify Playlist (${preview.length} songs)`}
                    </button>
                  )}
                </div>
              </div>

              {result && !result.success && (
                <div style={{ background: "#1a0a0a", border: "1px solid #5a1a1a",
                  borderRadius: "10px", padding: "12px 16px", marginBottom: "16px",
                  fontSize: "13px", color: "#f87171" }}>
                  {result.message}
                </div>
              )}

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px", marginBottom: "20px" }}>
                {[
                  { label: "Songs", value: preview.length },
                  { label: "Avg BPM", value: Math.round(preview.reduce((s, t) => s + (t.tempo || 0), 0) / (preview.filter(t => t.tempo).length || 1)) || "—" },
                  { label: "Avg Energy", value: preview.filter(t => t.energy).length ? Math.round(preview.reduce((s, t) => s + (t.energy || 0), 0) / preview.filter(t => t.energy).length * 100) + "%" : "—" },
                  { label: "Unique Artists", value: new Set(preview.map(t => t.artist)).size },
                ].map(s => (
                  <div key={s.label} className="card" style={{ textAlign: "center", padding: "16px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "#1db954" }}>{s.value}</div>
                    <div className="label" style={{ marginTop: "4px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Track list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {sorted.map(track => (
                  <div key={track.id} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 14px", borderRadius: "8px",
                    background: playing === track.id ? "#0d2b18" : "#0a0a0a",
                    border: `1px solid ${playing === track.id ? "#1db954" : "#111"}`
                  }}>
                    <button onClick={() => play(track.id, track.name, track.artist)} style={{
                      width: "30px", height: "30px", borderRadius: "50%", border: "none",
                      background: playing === track.id ? "#1db954" : "#1a1a1a",
                      color: playing === track.id ? "#000" : "#777",
                      cursor: "pointer", fontSize: "10px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {playing === track.id ? "■" : "▶"}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {track.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#555", marginTop: "1px" }}>
                        {track.artist} · {track.album}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0,
                      fontSize: "11px", alignItems: "center" }}>
                      <span style={{ color: "#444", background: "#111",
                        padding: "2px 7px", borderRadius: "4px" }}>{track.saved_at}</span>
                      {track.tempo && (
                        <span style={{ color: "#444", background: "#111",
                          padding: "2px 7px", borderRadius: "4px" }}>{Math.round(track.tempo)} BPM</span>
                      )}
                      {track.valence && (
                        <span style={{ color: moodColor(track.valence), background: "#111",
                          padding: "2px 7px", borderRadius: "4px" }}>
                          {track.valence < 0.3 ? "dark" : track.valence < 0.6 ? "neutral" : "happy"}
                        </span>
                      )}
                      <a href={track.spotify_url} target="_blank" rel="noreferrer"
                        style={{ color: "#2a2a2a", textDecoration: "none", padding: "2px 4px" }}>↗</a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
