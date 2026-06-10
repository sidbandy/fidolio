import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";

const API = "http://127.0.0.1:8000";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const moodColor = (v) => {
  if (!v) return "#444";
  if (v < 0.3) return "#6366f1";
  if (v < 0.6) return "#f59e0b";
  return "#1db954";
};

export default function TimeCapsule() {
  const [year,       setYear]       = useState(new Date().getFullYear());
  const [month,      setMonth]      = useState(new Date().getMonth() + 1);
  const [preview,    setPreview]    = useState(null);
  const [loadingPrev,setLoadingPrev]= useState(false);
  const [creating,   setCreating]   = useState(false);
  const [result,     setResult]     = useState(null);
  const [monthlyCounts, setMonthlyCounts] = useState({});
  const [sortBy,     setSortBy]     = useState("saved_at");
  const { playing, play } = usePreview();

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y);

  // Load monthly counts for the selected year
  useEffect(() => {
    const loadCounts = async () => {
      const counts = {};
      await Promise.all(
        Array.from({length: 12}, (_, i) => i + 1).map(async m => {
          try {
            const res  = await fetch(
              `${API}/library/liked-songs?min_year=${year}&max_year=${year}&offset=0&limit=1`
            );
            // We'll use a smarter approach — fetch each month's songs
            const r2 = await fetch(
              `${API}/library/liked-songs?sort_by=saved_at&order=desc&limit=200&offset=0`
            );
            const data = await r2.json();
            const monthStr = `${year}-${String(m).padStart(2,'0')}`;
            counts[m] = data.tracks?.filter(t =>
              t.saved_at?.startsWith(monthStr)
            ).length || 0;
          } catch {}
        })
      );
      setMonthlyCounts(counts);
    };
    loadCounts();
  }, [year]);

  const loadPreview = async () => {
    setLoadingPrev(true);
    setPreview(null);
    setResult(null);
    try {
      const monthStr = `${year}-${String(month).padStart(2,'0')}`;
      const res  = await fetch(
        `${API}/library/liked-songs?sort_by=${sortBy}&order=desc&limit=200&offset=0`
      );
      const data = await res.json();
      const filtered = (data.tracks || []).filter(t => t.saved_at?.startsWith(monthStr));
      setPreview(filtered);
    } catch(e) { console.error(e); }
    setLoadingPrev(false);
  };

  const createPlaylist = async () => {
    if (!preview?.length) return;
    setCreating(true);
    try {
      const res  = await fetch(
        `${API}/library/time-capsule?year=${year}&month=${month}`,
        { method: "POST" }
      );
      const data = await res.json();
      setResult(data);
    } catch(e) { setResult({ success: false, message: String(e) }); }
    setCreating(false);
  };

  const sortTracks = (tracks) => {
    if (!tracks) return [];
    const sorted = [...tracks];
    switch(sortBy) {
      case "energy":      return sorted.sort((a,b) => (b.energy || 0) - (a.energy || 0));
      case "valence":     return sorted.sort((a,b) => (b.valence || 0) - (a.valence || 0));
      case "tempo":       return sorted.sort((a,b) => (b.tempo || 0) - (a.tempo || 0));
      case "artist":      return sorted.sort((a,b) => a.artist.localeCompare(b.artist));
      case "release_year":return sorted.sort((a,b) => (b.release_year||0) - (a.release_year||0));
      default:            return sorted.sort((a,b) => b.saved_at?.localeCompare(a.saved_at));
    }
  };

  const sorted = sortTracks(preview);

  return (
    <div style={{ padding: "40px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Time Capsules
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "36px" }}>
        Every song you saved in a given month, turned into a Spotify playlist.
        A perfect archive of who you were.
      </p>

      {/* Year + Month picker */}
      <div className="card" style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start",
          flexWrap: "wrap" }}>

          {/* Year */}
          <div>
            <div className="label" style={{ marginBottom: "10px" }}>Year</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {years.map(y => (
                <button key={y} onClick={() => { setYear(y); setPreview(null); setResult(null); }}
                  style={{
                    padding: "6px 14px", borderRadius: "14px", border: "none",
                    background: year === y ? "#1db954" : "#151515",
                    color: year === y ? "#000" : "#666",
                    fontSize: "13px", fontWeight: 600, cursor: "pointer"
                  }}>{y}</button>
              ))}
            </div>
          </div>

          {/* Month grid */}
          <div style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: "10px" }}>Month</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px" }}>
              {MONTHS.map((m, i) => {
                const num = i + 1;
                const isFuture = year === new Date().getFullYear() &&
                  num > new Date().getMonth() + 1;
                return (
                  <button key={m} onClick={() => {
                    if (!isFuture) { setMonth(num); setPreview(null); setResult(null); }
                  }} style={{
                    padding: "8px 4px", borderRadius: "10px", border: "none",
                    background: month === num ? "#1db954" : "#151515",
                    color: isFuture ? "#2a2a2a" : month === num ? "#000" : "#666",
                    fontSize: "12px", fontWeight: 600,
                    cursor: isFuture ? "default" : "pointer",
                    textAlign: "center"
                  }}>
                    {m.slice(0,3)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected period */}
        <div style={{ marginTop: "20px", paddingTop: "20px",
          borderTop: "1px solid #1a1a1a",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "18px", fontWeight: 700 }}>
              {MONTHS[month-1]} {year}
            </span>
            {preview !== null && (
              <span style={{ color: "#555", fontSize: "14px", marginLeft: "12px" }}>
                {preview.length} songs saved this month
              </span>
            )}
          </div>
          <button onClick={loadPreview} disabled={loadingPrev} style={{
            padding: "10px 24px", borderRadius: "10px", border: "none",
            background: loadingPrev ? "#1a1a1a" : "#1db954",
            color: loadingPrev ? "#555" : "#000",
            fontWeight: 700, fontSize: "14px", cursor: loadingPrev ? "default" : "pointer"
          }}>
            {loadingPrev ? "Loading..." : "Preview Songs →"}
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview !== null && !loadingPrev && (
        <div>
          {preview.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px", color: "#555" }}>
              No songs saved in {MONTHS[month-1]} {year}.
            </div>
          ) : (
            <>
              {/* Sort bar */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px",
                alignItems: "center", flexWrap: "wrap" }}>
                <span className="label" style={{ marginRight: "4px" }}>Sort</span>
                {[
                  { v: "saved_at",    l: "Save Date" },
                  { v: "energy",      l: "Energy" },
                  { v: "valence",     l: "Mood" },
                  { v: "tempo",       l: "BPM" },
                  { v: "artist",      l: "Artist" },
                  { v: "release_year",l: "Release Year" },
                ].map(s => (
                  <button key={s.v} onClick={() => setSortBy(s.v)} style={{
                    padding: "5px 12px", borderRadius: "14px", border: "none",
                    background: sortBy === s.v ? "#1db954" : "#151515",
                    color: sortBy === s.v ? "#000" : "#666",
                    fontSize: "12px", fontWeight: 600, cursor: "pointer"
                  }}>{s.l}</button>
                ))}

                <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                  {result?.success ? (
                    <a href={result.playlist_url} target="_blank" rel="noreferrer"
                      style={{ padding: "8px 20px", borderRadius: "10px",
                        background: "#1db954", color: "#000",
                        fontWeight: 700, fontSize: "13px", textDecoration: "none" }}>
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

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px", marginBottom: "20px" }}>
                {[
                  { label: "Songs",
                    value: preview.length },
                  { label: "Avg BPM",
                    value: Math.round(preview.reduce((s,t) => s + (t.tempo||0), 0) / preview.filter(t=>t.tempo).length) || "—" },
                  { label: "Avg Energy",
                    value: preview.filter(t=>t.energy).length
                      ? Math.round(preview.reduce((s,t) => s + (t.energy||0), 0) / preview.filter(t=>t.energy).length * 100) + "%"
                      : "—" },
                  { label: "Unique Artists",
                    value: new Set(preview.map(t => t.artist)).size },
                ].map(s => (
                  <div key={s.label} className="card" style={{ textAlign: "center", padding: "16px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "#1db954" }}>
                      {s.value}
                    </div>
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
                      {track.release_year && (
                        <span style={{ color: "#555", background: "#111",
                          padding: "2px 7px", borderRadius: "4px", fontWeight: 600 }}>
                          {track.release_year}
                        </span>
                      )}
                      {track.tempo && (
                        <span style={{ color: "#444", background: "#111",
                          padding: "2px 7px", borderRadius: "4px" }}>
                          {Math.round(track.tempo)} BPM
                        </span>
                      )}
                      {track.valence && (
                        <span style={{ color: moodColor(track.valence), background: "#111",
                          padding: "2px 7px", borderRadius: "4px" }}>
                          {track.valence < 0.3 ? "dark" : track.valence < 0.6 ? "neutral" : "happy"}
                        </span>
                      )}
                      <a href={track.spotify_url} target="_blank" rel="noreferrer"
                        style={{ color: "#2a2a2a", textDecoration: "none", padding: "2px 4px" }}>
                        ↗
                      </a>
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