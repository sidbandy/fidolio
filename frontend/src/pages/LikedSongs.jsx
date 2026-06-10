import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";

const API = "http://127.0.0.1:8000";

const SORT_OPTIONS = [
  { value: "saved_at", label: "Date Saved" },
  { value: "energy",   label: "Energy" },
  { value: "valence",  label: "Mood" },
  { value: "tempo",    label: "BPM" },
  { value: "artist",   label: "Artist" },
  { value: "name",     label: "Title" },
];

const DECADES = [
  { label: "All Time", min: null, max: null },
  { label: "2020s",    min: 2020, max: 2029 },
  { label: "2010s",    min: 2010, max: 2019 },
  { label: "2000s",    min: 2000, max: 2009 },
  { label: "90s",      min: 1990, max: 1999 },
  { label: "80s",      min: 1980, max: 1989 },
];

const moodColor = (v) => {
  if (!v) return "#444";
  if (v < 0.3) return "#6366f1";
  if (v < 0.6) return "#f59e0b";
  return "#1db954";
};

export default function LikedSongs() {
  const [tracks,   setTracks]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [offset,   setOffset]   = useState(0);
  const [sortBy,   setSortBy]   = useState("saved_at");
  const [order,    setOrder]    = useState("desc");
  const [decade,   setDecade]   = useState(DECADES[0]);
  const [minEnergy, setMinEnergy] = useState("");
  const [maxEnergy, setMaxEnergy] = useState("");
  const [mood,     setMood]     = useState("any");
  const [artist,   setArtist]   = useState("");
  const [artistInput, setArtistInput] = useState("");
  const { playing, play }       = usePreview();
  const LIMIT = 50;

  const buildParams = (off = 0) => {
    const p = new URLSearchParams();
    p.set("sort_by", sortBy);
    p.set("order", order);
    p.set("limit", LIMIT);
    p.set("offset", off);
    if (decade.min) { p.set("min_year", decade.min); p.set("max_year", decade.max); }
    if (minEnergy) p.set("min_energy", minEnergy);
    if (maxEnergy) p.set("max_energy", maxEnergy);
    if (mood === "happy") p.set("min_valence", "0.6");
    if (mood === "dark")  p.set("max_valence", "0.35");
    if (artist) p.set("artist", artist);
    return p;
  };

  const fetch_ = async (off = 0) => {
    setLoading(true);
    const res  = await fetch(`${API}/library/liked-songs?${buildParams(off)}`);
    const data = await res.json();
    if (off === 0) setTracks(data.tracks);
    else setTracks(prev => [...prev, ...data.tracks]);
    setTotal(data.total);
    setOffset(off + LIMIT);
    setLoading(false);
  };

  useEffect(() => { fetch_(0); }, [sortBy, order, decade, minEnergy, maxEnergy, mood, artist]);

  const applyArtist = () => { setArtist(artistInput); };

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Liked Songs
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "32px" }}>
        {total.toLocaleString()} songs — sorted, filtered, and actually findable.
      </p>

      {/* Filter bar */}
      <div style={{ background: "#0e0e0e", borderRadius: "14px", padding: "20px",
        marginBottom: "24px", border: "1px solid #1a1a1a",
        display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>

        {/* Sort */}
        <div>
          <div className="label" style={{ marginBottom: "6px" }}>Sort by</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {SORT_OPTIONS.map(s => (
              <button key={s.value} onClick={() => setSortBy(s.value)} style={{
                padding: "6px 14px", borderRadius: "16px", border: "none",
                background: sortBy === s.value ? "#1db954" : "#1a1a1a",
                color: sortBy === s.value ? "#000" : "#666",
                fontSize: "12px", fontWeight: 600, cursor: "pointer"
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Order */}
        <div>
          <div className="label" style={{ marginBottom: "6px" }}>Order</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["desc","asc"].map(o => (
              <button key={o} onClick={() => setOrder(o)} style={{
                padding: "6px 14px", borderRadius: "16px", border: "none",
                background: order === o ? "#1db954" : "#1a1a1a",
                color: order === o ? "#000" : "#666",
                fontSize: "12px", fontWeight: 600, cursor: "pointer"
              }}>{o === "desc" ? "↓ High to Low" : "↑ Low to High"}</button>
            ))}
          </div>
        </div>

        {/* Decade */}
        <div>
          <div className="label" style={{ marginBottom: "6px" }}>Decade saved</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {DECADES.map(d => (
              <button key={d.label} onClick={() => setDecade(d)} style={{
                padding: "6px 14px", borderRadius: "16px", border: "none",
                background: decade.label === d.label ? "#1db954" : "#1a1a1a",
                color: decade.label === d.label ? "#000" : "#666",
                fontSize: "12px", fontWeight: 600, cursor: "pointer"
              }}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* Mood */}
        <div>
          <div className="label" style={{ marginBottom: "6px" }}>Mood</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["any","happy","dark"].map(m => (
              <button key={m} onClick={() => setMood(m)} style={{
                padding: "6px 14px", borderRadius: "16px", border: "none",
                background: mood === m ? "#1db954" : "#1a1a1a",
                color: mood === m ? "#000" : "#666",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
                textTransform: "capitalize"
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Artist search */}
        <div>
          <div className="label" style={{ marginBottom: "6px" }}>Artist</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={artistInput}
              onChange={e => setArtistInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyArtist()}
              placeholder="Filter by artist..."
              style={{ padding: "7px 12px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none", width: "160px" }}
            />
            <button onClick={applyArtist} style={{
              padding: "7px 14px", borderRadius: "8px", border: "none",
              background: "#1db954", color: "#000",
              fontSize: "12px", fontWeight: 700, cursor: "pointer"
            }}>Go</button>
            {artist && (
              <button onClick={() => { setArtist(""); setArtistInput(""); }} style={{
                padding: "7px 12px", borderRadius: "8px", border: "none",
                background: "#1a1a1a", color: "#666",
                fontSize: "12px", cursor: "pointer"
              }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: "13px", color: "#444", marginBottom: "16px" }}>
        Showing {tracks.length} of {total.toLocaleString()} songs
      </div>

      {/* Track list */}
      {loading && tracks.length === 0 ? (
        <div className="loading">Loading your library...</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {tracks.map((track, i) => (
              <div key={track.id} style={{
                display: "flex", alignItems: "center", gap: "14px",
                padding: "12px 16px", borderRadius: "10px",
                background: playing === track.id ? "#0d2b18" : "#0e0e0e",
                border: `1px solid ${playing === track.id ? "#1db954" : "#161616"}`,
                transition: "all 0.15s"
              }}>
                <button onClick={() => play(track.id, track.name, track.artist)} style={{
                  width: "32px", height: "32px", borderRadius: "50%", border: "none",
                  background: playing === track.id ? "#1db954" : "#1a1a1a",
                  color: playing === track.id ? "#000" : "#888",
                  cursor: "pointer", fontSize: "11px", flexShrink: 0,
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

                <div style={{ display: "flex", gap: "8px", flexShrink: 0,
                  fontSize: "11px", alignItems: "center" }}>
                  {track.tempo && (
                    <span style={{ color: "#444", background: "#151515",
                      padding: "2px 7px", borderRadius: "4px" }}>
                      {Math.round(track.tempo)} BPM
                    </span>
                  )}
                  {track.energy && (
                    <span style={{ color: "#444", background: "#151515",
                      padding: "2px 7px", borderRadius: "4px" }}>
                      {Math.round(track.energy * 100)}% energy
                    </span>
                  )}
                  {track.valence && (
                    <span style={{ color: moodColor(track.valence), background: "#151515",
                      padding: "2px 7px", borderRadius: "4px" }}>
                      {track.valence < 0.3 ? "dark" : track.valence < 0.6 ? "neutral" : "happy"}
                    </span>
                  )}
                  <span style={{ color: "#2a2a2a" }}>{track.saved_at}</span>
                  <a href={track.spotify_url} target="_blank" rel="noreferrer"
                    style={{ color: "#333", textDecoration: "none" }}>↗</a>
                </div>
              </div>
            ))}
          </div>

          {tracks.length < total && (
            <button onClick={() => fetch_(offset)} disabled={loading} style={{
              width: "100%", marginTop: "20px", padding: "14px",
              borderRadius: "12px", border: "none",
              background: loading ? "#1a1a1a" : "#111",
              color: loading ? "#333" : "#666",
              fontSize: "14px", cursor: "pointer",
              border: "1px solid #1a1a1a"
            }}>
              {loading ? "Loading..." : `Load more (${total - tracks.length} remaining)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}