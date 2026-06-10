import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";

const API = "http://127.0.0.1:8000";

const SORT_OPTIONS = [
  { value: "saved_at",  label: "Date Saved" },
  { value: "energy",    label: "Energy" },
  { value: "valence",   label: "Mood" },
  { value: "tempo",     label: "BPM" },
  { value: "artist",    label: "Artist" },
  { value: "name",      label: "Title" },
  { value: "release_year", label: "Release Year" },
];

const DECADES = [
  { label: "All",   min: null, max: null },
  { label: "2020s", min: 2020, max: 2029 },
  { label: "2010s", min: 2010, max: 2019 },
  { label: "2000s", min: 2000, max: 2009 },
  { label: "90s",   min: 1990, max: 1999 },
  { label: "80s",   min: 1980, max: 1989 },
  { label: "70s",   min: 1970, max: 1979 },
  { label: "Older", min: 1900, max: 1969 },
];

const moodColor = (v) => {
  if (!v) return "#444";
  if (v < 0.3) return "#6366f1";
  if (v < 0.6) return "#f59e0b";
  return "#1db954";
};

export default function LikedSongs() {
  const [tracks,      setTracks]      = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [offset,      setOffset]      = useState(0);
  const [sortBy,      setSortBy]      = useState("saved_at");
  const [order,       setOrder]       = useState("desc");
  const [decade,      setDecade]      = useState(DECADES[0]);
  const [mood,        setMood]        = useState("any");
  const [minEnergy,   setMinEnergy]   = useState("");
  const [maxEnergy,   setMaxEnergy]   = useState("");
  const [minTempo,    setMinTempo]    = useState("");
  const [maxTempo,    setMaxTempo]    = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [artist,      setArtist]      = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const { playing, play } = usePreview();
  const LIMIT = 50;

  const buildParams = (off = 0) => {
    const p = new URLSearchParams();
    p.set("sort_by", sortBy);
    p.set("order", order);
    p.set("limit", LIMIT);
    p.set("offset", off);
    if (decade.min) {
      p.set("min_year", decade.min);
      p.set("max_year", decade.max);
    }
    if (minEnergy)  p.set("min_energy", minEnergy);
    if (maxEnergy)  p.set("max_energy", maxEnergy);
    if (minTempo)   p.set("min_tempo",  minTempo);
    if (maxTempo)   p.set("max_tempo",  maxTempo);
    if (mood === "happy") p.set("min_valence", "0.6");
    if (mood === "dark")  p.set("max_valence", "0.35");
    if (artist)     p.set("artist", artist);
    return p;
  };

  const load = async (off = 0) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/library/liked-songs?${buildParams(off)}`);
      const data = await res.json();
      if (off === 0) setTracks(data.tracks || []);
      else setTracks(prev => [...prev, ...(data.tracks || [])]);
      setTotal(data.total || 0);
      setOffset(off + LIMIT);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(0); },
    [sortBy, order, decade, mood, minEnergy, maxEnergy, minTempo, maxTempo, artist]);

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "6px" }}>
            Liked Songs
          </h1>
          <p style={{ color: "#555", fontSize: "15px" }}>
            {total.toLocaleString()} songs — sorted, filtered, and actually findable.
          </p>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} style={{
          padding: "8px 18px", borderRadius: "10px", border: "none",
          background: showFilters ? "#1db954" : "#1a1a1a",
          color: showFilters ? "#000" : "#666",
          fontSize: "13px", fontWeight: 600, cursor: "pointer"
        }}>
          {showFilters ? "Hide Filters" : "Filters"}
        </button>
      </div>

      {/* Sort bar — always visible */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {SORT_OPTIONS.map(s => (
          <button key={s.value} onClick={() => {
            if (sortBy === s.value) setOrder(o => o === "desc" ? "asc" : "desc");
            else { setSortBy(s.value); setOrder("desc"); }
          }} style={{
            padding: "6px 14px", borderRadius: "16px", border: "none",
            background: sortBy === s.value ? "#1db954" : "#151515",
            color: sortBy === s.value ? "#000" : "#666",
            fontSize: "12px", fontWeight: 600, cursor: "pointer"
          }}>
            {s.label} {sortBy === s.value ? (order === "desc" ? "↓" : "↑") : ""}
          </button>
        ))}
      </div>

      {/* Decade filter — always visible */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
        <span style={{ fontSize: "11px", color: "#444", alignSelf: "center",
          marginRight: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
          Release Decade
        </span>
        {DECADES.map(d => (
          <button key={d.label} onClick={() => setDecade(d)} style={{
            padding: "5px 14px", borderRadius: "14px", border: "none",
            background: decade.label === d.label ? "#1db954" : "#151515",
            color: decade.label === d.label ? "#000" : "#666",
            fontSize: "12px", fontWeight: 600, cursor: "pointer"
          }}>{d.label}</button>
        ))}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div style={{ background: "#0e0e0e", borderRadius: "14px", padding: "20px",
          marginBottom: "16px", border: "1px solid #1a1a1a",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Mood</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {["any","happy","dark"].map(m => (
                <button key={m} onClick={() => setMood(m)} style={{
                  padding: "6px 10px", borderRadius: "8px", border: "none",
                  background: mood === m ? "#1db954" : "#111",
                  color: mood === m ? "#000" : "#555",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  textTransform: "capitalize"
                }}>{m}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Min Energy</div>
            <input type="number" step="0.1" min="0" max="1"
              value={minEnergy} onChange={e => setMinEnergy(e.target.value)}
              placeholder="0.0 – 1.0"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none" }} />
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>BPM Range</div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input type="number" value={minTempo}
                onChange={e => setMinTempo(e.target.value)}
                placeholder="Min" style={{ width: "50%", padding: "8px",
                  borderRadius: "8px", background: "#111",
                  border: "1px solid #222", color: "#fff",
                  fontSize: "13px", outline: "none" }} />
              <input type="number" value={maxTempo}
                onChange={e => setMaxTempo(e.target.value)}
                placeholder="Max" style={{ width: "50%", padding: "8px",
                  borderRadius: "8px", background: "#111",
                  border: "1px solid #222", color: "#fff",
                  fontSize: "13px", outline: "none" }} />
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Artist</div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input value={artistInput}
                onChange={e => setArtistInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setArtist(artistInput)}
                placeholder="Filter artist..."
                style={{ flex: 1, padding: "8px 10px", borderRadius: "8px",
                  background: "#111", border: "1px solid #222",
                  color: "#fff", fontSize: "13px", outline: "none" }} />
              <button onClick={() => setArtist(artistInput)} style={{
                padding: "8px 12px", borderRadius: "8px", border: "none",
                background: "#1db954", color: "#000",
                fontSize: "12px", fontWeight: 700, cursor: "pointer"
              }}>Go</button>
              {artist && (
                <button onClick={() => { setArtist(""); setArtistInput(""); }} style={{
                  padding: "8px 10px", borderRadius: "8px", border: "none",
                  background: "#1a1a1a", color: "#666",
                  fontSize: "12px", cursor: "pointer"
                }}>✕</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: "12px", color: "#333", marginBottom: "16px" }}>
        {loading && tracks.length === 0 ? "Loading..." : `${tracks.length} of ${total.toLocaleString()} songs`}
      </div>

      {/* Track list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {tracks.map(track => (
          <div key={track.id} style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "10px 14px", borderRadius: "8px",
            background: playing === track.id ? "#0d2b18" : "#0a0a0a",
            border: `1px solid ${playing === track.id ? "#1db954" : "#111"}`,
            transition: "all 0.15s"
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
              {track.energy && (
                <span style={{ color: "#444", background: "#111",
                  padding: "2px 7px", borderRadius: "4px" }}>
                  {Math.round(track.energy * 100)}%
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

      {tracks.length < total && (
        <button onClick={() => load(offset)} disabled={loading} style={{
          width: "100%", marginTop: "16px", padding: "14px",
          borderRadius: "12px", border: "1px solid #1a1a1a",
          background: "#0e0e0e", color: loading ? "#333" : "#555",
          fontSize: "14px", cursor: loading ? "default" : "pointer"
        }}>
          {loading ? "Loading..." : `Load more (${(total - tracks.length).toLocaleString()} remaining)`}
        </button>
      )}
    </div>
  );
}