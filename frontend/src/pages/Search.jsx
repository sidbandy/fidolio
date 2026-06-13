import { useState, useRef } from "react";
import usePreview from "../hooks/usePreview";

const API = "http://127.0.0.1:8000";

const QUICK_VIBES = [
  { label: "🌙 Late Night",   params: { max_valence: 0.4, max_energy: 0.55 } },
  { label: "⚡ High Energy",  params: { min_energy: 0.8, min_tempo: 125 } },
  { label: "😢 Sad Hours",    params: { max_valence: 0.3, max_energy: 0.45 } },
  { label: "☀️ Good Vibes",   params: { min_valence: 0.65, min_energy: 0.55 } },
  { label: "🎸 Acoustic",     params: { min_acousticness: 0.65 } },
  { label: "🕺 Dance Floor",  params: { min_danceability: 0.75, min_energy: 0.65 } },
  { label: "🧠 Focus",        params: { max_energy: 0.45, max_speechiness: 0.1 } },
  { label: "💿 90s",          params: { min_year: 1990, max_year: 1999 } },
  { label: "💿 2000s",        params: { min_year: 2000, max_year: 2009 } },
  { label: "💿 2010s",        params: { min_year: 2010, max_year: 2019 } },
];

const moodColor = (v) => {
  if (!v) return "#333";
  if (v < 0.3) return "#6366f1";
  if (v < 0.6) return "#f59e0b";
  return "#1db954";
};

function TrackRow({ track, playing, onPlay }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "14px",
      padding: "12px 16px", borderRadius: "10px",
      background: playing === track.id ? "#0d2b18" : "#0a0a0a",
      border: `1px solid ${playing === track.id ? "#1db954" : "#111"}`,
      transition: "all 0.15s"
    }}>
      <button onClick={() => onPlay(track.id, track.name, track.artist)} style={{
        width: "32px", height: "32px", borderRadius: "50%", border: "none",
        background: playing === track.id ? "#1db954" : "#1a1a1a",
        color: playing === track.id ? "#000" : "#777",
        cursor: "pointer", fontSize: "11px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {playing === track.id ? "■" : "▶"}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>
          {track.artist} · {track.album}
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", flexShrink: 0,
        fontSize: "11px", alignItems: "center" }}>
        {track.release_year && (
          <span style={{ color: "#444", background: "#111",
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
          style={{ color: "#2a2a2a", textDecoration: "none", padding: "2px 6px" }}>
          ↗
        </a>
      </div>
    </div>
  );
}

export default function Search() {
  const [mode,         setMode]         = useState("nlp"); // "nlp" | "filters"
  const [nlpQuery,     setNlpQuery]     = useState("");
  const [interpreted,  setInterpreted]  = useState(null);
  const [results,      setResults]      = useState(null);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [weatherData,  setWeatherData]  = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Manual filter state
  const [textQ,        setTextQ]        = useState("");
  const [minTempo,     setMinTempo]     = useState("");
  const [maxTempo,     setMaxTempo]     = useState("");
  const [minEnergy,    setMinEnergy]    = useState("");
  const [maxEnergy,    setMaxEnergy]    = useState("");
  const [minValence,   setMinValence]   = useState("");
  const [maxValence,   setMaxValence]   = useState("");
  const [minYear,      setMinYear]      = useState("");
  const [maxYear,      setMaxYear]      = useState("");
  const [artistFilter, setArtistFilter] = useState("");
  const [minAcoustic,  setMinAcoustic]  = useState("");

  const { playing, play } = usePreview();

  const nlpSearch = async () => {
    if (!nlpQuery.trim()) return;
    setLoading(true);
    setInterpreted(null);
    const res  = await fetch(`${API}/search/nlp?q=${encodeURIComponent(nlpQuery)}&limit=25`);
    const data = await res.json();
    setResults(data.results || []);
    setTotal(data.total || 0);
    setInterpreted(data.interpreted);
    setLoading(false);
  };

  const filterSearch = async (extraParams = {}) => {
    setLoading(true);
    setInterpreted(null);
    const p = new URLSearchParams();
    if (textQ)        p.set("q",                textQ);
    if (minTempo)     p.set("min_tempo",         minTempo);
    if (maxTempo)     p.set("max_tempo",         maxTempo);
    if (minEnergy)    p.set("min_energy",        minEnergy);
    if (maxEnergy)    p.set("max_energy",        maxEnergy);
    if (minValence)   p.set("min_valence",       minValence);
    if (maxValence)   p.set("max_valence",       maxValence);
    if (minYear)      p.set("min_year",          minYear);
    if (maxYear)      p.set("max_year",          maxYear);
    if (artistFilter) p.set("artist",            artistFilter);
    if (minAcoustic)  p.set("min_acousticness",  minAcoustic);
    Object.entries(extraParams).forEach(([k,v]) => p.set(k, v));
    p.set("limit", "25");
    const res  = await fetch(`${API}/search/?${p}`);
    const data = await res.json();
    setResults(data.results || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  const weatherSearch = async () => {
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const res  = await fetch(
        `${API}/search/weather-vibe?lat=${lat}&lon=${lon}&limit=25`
      );
      const data = await res.json();
      if (data.error) { setWeatherLoading(false); return; }
      setWeatherData(data.weather);
      setResults(data.results || []);
      setTotal(data.results?.length || 0);
      setInterpreted(data.weather?.explanation);
      setWeatherLoading(false);
    }, () => {
      alert("Location access needed for weather search.");
      setWeatherLoading(false);
    });
  };

  const resetFilters = () => {
    setTextQ(""); setMinTempo(""); setMaxTempo("");
    setMinEnergy(""); setMaxEnergy(""); setMinValence("");
    setMaxValence(""); setMinYear(""); setMaxYear("");
    setArtistFilter(""); setMinAcoustic("");
    setResults(null); setInterpreted(null); setWeatherData(null);
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
          Search Your Library
        </h1>
        <p style={{ color: "#555", fontSize: "15px" }}>
          Describe what you want or use filters — search all 11,000+ songs by vibe, mood, era, or artist.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {[
          { id: "nlp",     label: "✨ Describe It" },
          { id: "filters", label: "🎚️ Use Filters" },
        ].map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setResults(null); }} style={{
            padding: "8px 20px", borderRadius: "20px", border: "none",
            background: mode === m.id ? "#1db954" : "#1a1a1a",
            color: mode === m.id ? "#000" : "#666",
            fontWeight: 700, fontSize: "13px", cursor: "pointer"
          }}>{m.label}</button>
        ))}
        <button onClick={weatherSearch} disabled={weatherLoading} style={{
          padding: "8px 20px", borderRadius: "20px", border: "none",
          background: weatherData ? "#f59e0b" : "#1a1a1a",
          color: weatherData ? "#000" : "#666",
          fontWeight: 700, fontSize: "13px", cursor: "pointer", marginLeft: "auto"
        }}>
          {weatherLoading ? "Getting weather..." : "🌤️ Match My Weather"}
        </button>
      </div>

      {/* NLP mode */}
      {mode === "nlp" && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <input
              value={nlpQuery}
              onChange={e => setNlpQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nlpSearch()}
              placeholder='Try: "sad slow mac miller songs" or "chill acoustic 90s stuff" or "dark electronic from 2019"'
              style={{
                flex: 1, padding: "14px 20px", borderRadius: "12px",
                background: "#111", border: "1px solid #1a1a1a",
                color: "#fff", fontSize: "15px", outline: "none"
              }}
              autoFocus
            />
            <button onClick={nlpSearch} style={{
              padding: "14px 28px", borderRadius: "12px", border: "none",
              background: "#1db954", color: "#000",
              fontWeight: 700, fontSize: "15px", cursor: "pointer"
            }}>Search</button>
          </div>

          {/* Interpretation badge */}
          {interpreted && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "#0d2b18", border: "1px solid #1a4a2a",
              borderRadius: "8px", padding: "6px 14px", fontSize: "13px"
            }}>
              <span style={{ color: "#1db954" }}>✓ Interpreted as:</span>
              <span style={{ color: "#aaa" }}>{interpreted}</span>
            </div>
          )}

          {/* NLP quick suggestions */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            {[
              "chill late night vibes",
              "sad slow songs",
              "hype workout bangers",
              "acoustic folk 70s",
              "dark electronic",
              "happy upbeat summer",
              "focus study no lyrics",
              "nostalgic 2000s rap",
            ].map(s => (
              <button key={s} onClick={() => { setNlpQuery(s); }} style={{
                padding: "5px 12px", borderRadius: "14px", border: "1px solid #1a1a1a",
                background: "transparent", color: "#555",
                fontSize: "12px", cursor: "pointer"
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Filter mode */}
      {mode === "filters" && (
        <div style={{ marginBottom: "24px" }}>
          {/* Quick vibes */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
            {QUICK_VIBES.map(v => (
              <button key={v.label} onClick={() => { resetFilters(); filterSearch(v.params); }} style={{
                padding: "6px 14px", borderRadius: "16px", border: "none",
                background: "#151515", color: "#666",
                fontSize: "12px", fontWeight: 600, cursor: "pointer"
              }}>{v.label}</button>
            ))}
          </div>

          {/* Filter grid */}
          <div style={{ background: "#0e0e0e", borderRadius: "14px",
            padding: "20px", border: "1px solid #1a1a1a",
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px",
            marginBottom: "16px" }}>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>Text search</div>
              <input value={textQ} onChange={e => setTextQ(e.target.value)}
                placeholder="Song name, album..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px",
                  background: "#111", border: "1px solid #1a1a1a",
                  color: "#fff", fontSize: "13px", outline: "none",
                  boxSizing: "border-box" }} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>Artist</div>
              <input value={artistFilter} onChange={e => setArtistFilter(e.target.value)}
                placeholder="Artist name..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px",
                  background: "#111", border: "1px solid #1a1a1a",
                  color: "#fff", fontSize: "13px", outline: "none",
                  boxSizing: "border-box" }} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>BPM range</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="number" value={minTempo} onChange={e => setMinTempo(e.target.value)}
                  placeholder="Min" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
                <input type="number" value={maxTempo} onChange={e => setMaxTempo(e.target.value)}
                  placeholder="Max" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>Energy (0–1)</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="number" step="0.1" value={minEnergy}
                  onChange={e => setMinEnergy(e.target.value)}
                  placeholder="Min" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
                <input type="number" step="0.1" value={maxEnergy}
                  onChange={e => setMaxEnergy(e.target.value)}
                  placeholder="Max" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>Mood / Valence (0–1)</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="number" step="0.1" value={minValence}
                  onChange={e => setMinValence(e.target.value)}
                  placeholder="Min" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
                <input type="number" step="0.1" value={maxValence}
                  onChange={e => setMaxValence(e.target.value)}
                  placeholder="Max" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: "6px" }}>Release Year</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="number" value={minYear} onChange={e => setMinYear(e.target.value)}
                  placeholder="From" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
                <input type="number" value={maxYear} onChange={e => setMaxYear(e.target.value)}
                  placeholder="To" style={{ width: "50%", padding: "9px 8px",
                    borderRadius: "8px", background: "#111", border: "1px solid #1a1a1a",
                    color: "#fff", fontSize: "13px", outline: "none" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => filterSearch()} style={{
              padding: "12px 32px", borderRadius: "12px", border: "none",
              background: "#1db954", color: "#000",
              fontWeight: 700, fontSize: "14px", cursor: "pointer"
            }}>Search</button>
            <button onClick={resetFilters} style={{
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: "#1a1a1a", color: "#666",
              fontSize: "14px", cursor: "pointer"
            }}>Reset</button>
          </div>
        </div>
      )}

      {/* Weather banner */}
      {weatherData && (
        <div style={{
          background: "#1a1500", border: "1px solid #3a3000",
          borderRadius: "10px", padding: "12px 16px",
          marginBottom: "20px", fontSize: "13px",
          display: "flex", alignItems: "center", gap: "12px"
        }}>
          <span style={{ fontSize: "20px" }}>🌤️</span>
          <span style={{ color: "#f59e0b" }}>
            {weatherData.temperature}°C · {weatherData.explanation}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="loading">Searching your library...</div>}

      {/* Results */}
      {results && !loading && (
        <>
          <div style={{ fontSize: "13px", color: "#444", marginBottom: "14px" }}>
            {results.length} songs
            {total > results.length ? ` of ${total.toLocaleString()} matches` : ""}
          </div>

          {results.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "60px", color: "#444" }}>
              No songs found. Try a different description or fewer filters.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {results.map(track => (
                <TrackRow
                  key={track.id}
                  track={track}
                  playing={playing}
                  onPlay={play}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#1a1a1a" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
          <div style={{ fontSize: "16px", color: "#333" }}>
            Describe what you want to hear right now.
          </div>
        </div>
      )}
    </div>
  );
}