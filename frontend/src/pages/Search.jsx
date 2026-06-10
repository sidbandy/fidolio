import { useState } from "react";

const API = "http://127.0.0.1:8000";

const PRESETS = [
  { label: "High Energy",     params: { min_energy: 0.8, min_tempo: 120 } },
  { label: "Chill & Acoustic",params: { max_energy: 0.4, min_acousticness: 0.5 } },
  { label: "Dark & Slow",     params: { max_valence: 0.3, max_tempo: 90 } },
  { label: "Dance Floor",     params: { min_danceability: 0.75, min_energy: 0.6 } },
  { label: "Instrumental",    params: { max_speechiness: 0.1 } },
  { label: "Sad Songs",       params: { max_valence: 0.25 } },
];

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [audio, setAudio] = useState(null);

  const search = async (extraParams = {}) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
    const res = await fetch(`${API}/search/?${params}`);
    const data = await res.json();
    setResults(data.results);
    setLoading(false);
  };

  const playPreview = (track) => {
    if (!track.preview_url) return;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    if (playing === track.id) { setPlaying(null); return; }
    const a = new Audio(track.preview_url);
    a.play();
    a.onended = () => setPlaying(null);
    setAudio(a);
    setPlaying(track.id);
  };

  const moodColor = (v) => {
    if (!v) return "#333";
    if (v < 0.3) return "#6366f1";
    if (v < 0.6) return "#f59e0b";
    return "#1db954";
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>Search Your Library</h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "32px" }}>Search by name, artist, or filter by vibe.</p>

      {/* Search bar */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder='Search by song name, artist, album...'
          style={{
            flex: 1, padding: "14px 20px", borderRadius: "12px",
            background: "#111", border: "1px solid #1a1a1a",
            color: "#fff", fontSize: "15px", outline: "none"
          }}
        />
        <button onClick={() => search()} style={{
          padding: "14px 28px", borderRadius: "12px", border: "none",
          background: "#1db954", color: "#000", fontWeight: 700,
          fontSize: "15px", cursor: "pointer"
        }}>
          Search
        </button>
      </div>

      {/* Presets */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "32px" }}>
        <span style={{ fontSize: "12px", color: "#444", alignSelf: "center", marginRight: "4px" }}>QUICK FILTERS</span>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setQuery(""); search(p.params); }} style={{
            padding: "6px 16px", borderRadius: "20px", border: "1px solid #222",
            background: "transparent", color: "#888", fontSize: "13px", cursor: "pointer"
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading && <div className="loading">Searching...</div>}
      {results && !loading && (
        <>
          <div style={{ fontSize: "13px", color: "#444", marginBottom: "16px" }}>
            {results.length} results
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {results.map((track, i) => (
              <div key={track.id} className="card" style={{
                display: "flex", alignItems: "center", gap: "16px",
                padding: "16px 20px",
                border: playing === track.id ? "1px solid #1db954" : "1px solid #1a1a1a",
                transition: "border 0.2s"
              }}>

                {/* Play button */}
                <button onClick={() => playPreview(track)} style={{
                  width: "36px", height: "36px", borderRadius: "50%", border: "none",
                  background: track.preview_url ? (playing === track.id ? "#1db954" : "#1a1a1a") : "#0a0a0a",
                  color: playing === track.id ? "#000" : "#fff",
                  cursor: track.preview_url ? "pointer" : "default",
                  fontSize: "14px", flexShrink: 0
                }}>
                  {playing === track.id ? "■" : "▶"}
                </button>

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {track.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>
                    {track.artist} · {track.album}
                  </div>
                </div>

                {/* Audio feature pills */}
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {track.tempo && (
                    <span style={{ fontSize: "11px", color: "#666", background: "#151515", padding: "3px 8px", borderRadius: "4px" }}>
                      {Math.round(track.tempo)} BPM
                    </span>
                  )}
                  {track.energy && (
                    <span style={{ fontSize: "11px", color: "#666", background: "#151515", padding: "3px 8px", borderRadius: "4px" }}>
                      {Math.round(track.energy * 100)}% energy
                    </span>
                  )}
                  {track.valence && (
                    <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "4px", background: "#151515", color: moodColor(track.valence) }}>
                      {track.valence < 0.3 ? "dark" : track.valence < 0.6 ? "neutral" : "happy"}
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "#333", padding: "3px 8px" }}>
                    {track.saved_at}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {results?.length === 0 && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px", color: "#555" }}>
          No songs found. Try different filters.
        </div>
      )}
    </div>
  );
}