import { useState, useRef } from "react";

const API = "http://127.0.0.1:8000";

const VIBES = [
  { label: "Late Night",  emoji: "🌙", value: "late night 2am insomnia" },
  { label: "Hype",        emoji: "⚡", value: "hype energetic banger rage" },
  { label: "Sad Hours",   emoji: "💙", value: "sad melancholy heartbreak emotional" },
  { label: "Deep Focus",  emoji: "🧠", value: "study focus productive concentrate" },
  { label: "Good Vibes",  emoji: "☀️", value: "happy upbeat feel good joyful" },
  { label: "Acoustic",    emoji: "🎸", value: "acoustic folk raw stripped" },
  { label: "Dance Floor", emoji: "🕺", value: "party dance groove floor" },
  { label: "Driving",     emoji: "🚗", value: "driving road trip highway windows down" },
  { label: "Nostalgic",   emoji: "📼", value: "nostalgic throwback memories" },
  { label: "Gym",         emoji: "💪", value: "gym run cardio lift sprint" },
];

const LANGUAGES = [
  { value: "en",       label: "English only" },
  { value: "en+hi",    label: "English + Hindi" },
  { value: "en+hi+bn", label: "English + Hindi + Bengali" },
  { value: "any",      label: "Any language" },
];

function LibraryTrack({ track }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "14px",
      padding: "12px 16px", borderRadius: "10px",
      background: "#0d2b18", border: "1px solid #1a4a2a"
    }}>
      <div style={{
        width: "34px", height: "34px", borderRadius: "50%",
        background: "#1db954", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: "14px", flexShrink: 0
      }}>✓</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "14px" }}>{track.name}</div>
        <div style={{ fontSize: "12px", color: "#4a9a5a", marginTop: "2px" }}>{track.artist}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", fontSize: "11px", color: "#2a6a3a" }}>
        {track.tempo && <span>{Math.round(track.tempo)} BPM</span>}
        {track.energy && <span>{Math.round(track.energy * 100)}% energy</span>}
      </div>
      <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{
        fontSize: "11px", color: "#1db954", textDecoration: "none",
        padding: "4px 10px", borderRadius: "6px", border: "1px solid #1db95440"
      }}>Open ↗</a>
    </div>
  );
}

function DiscoveryTrack({ track }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "14px",
      padding: "12px 16px", borderRadius: "10px",
      background: "#111", border: "1px solid #1a1a1a",
      transition: "border 0.15s"
    }}>
      <div style={{
        width: "34px", height: "34px", borderRadius: "50%",
        background: "#1a1a1a", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: "14px", color: "#555", flexShrink: 0
      }}>♪</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
          {track.name}
          {track.already_saved && (
            <span style={{ fontSize: "10px", color: "#1db954", background: "#0d2b18",
              padding: "2px 6px", borderRadius: "4px" }}>SAVED</span>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>{track.artist}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {track.popularity && (
          <span style={{ fontSize: "11px", color: "#333" }}>{track.popularity}%</span>
        )}
        <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{
          fontSize: "11px", color: "#1db954", textDecoration: "none",
          background: "#0d2b18", padding: "4px 10px", borderRadius: "6px"
        }}>Open ↗</a>
      </div>
    </div>
  );
}

export default function Discovery() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeVibe, setActiveVibe] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const [vibe, setVibe] = useState("");
  const [seedSong, setSeedSong] = useState("");
  const [artists, setArtists] = useState("");
  const [language, setLanguage] = useState("en");
  const [minTempo, setMinTempo] = useState("");
  const [maxTempo, setMaxTempo] = useState("");
  const [mood, setMood] = useState("any"); // happy | dark | any

  const discover = async () => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams();
    if (vibe)     params.set("vibe", vibe);
    if (seedSong) params.set("seed_song", seedSong);
    if (artists)  params.set("artists", artists);
    params.set("language", language);
    params.set("size", "22");
    if (minTempo) params.set("min_tempo", minTempo);
    if (maxTempo) params.set("max_tempo", maxTempo);
    if (mood === "happy")  { params.set("min_valence", "0.6"); }
    if (mood === "dark")   { params.set("max_valence", "0.35"); }

    try {
      const res = await fetch(`${API}/discovery/for-me?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const ctx = data?.context;

  return (
    <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto" }}>

      <div style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954" }}>Discovery</h1>
        <p style={{ color: "#555", marginTop: "6px", fontSize: "15px" }}>
          Personalized to your taste, your time of day, and your mood.
        </p>
      </div>

      {/* Vibe quick picks */}
      <div style={{ marginBottom: "20px" }}>
        <div className="label" style={{ marginBottom: "10px" }}>Quick vibe</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {VIBES.map(v => (
            <button key={v.label} onClick={() => {
              setActiveVibe(v.label);
              setVibe(v.value);
            }} style={{
              padding: "8px 16px", borderRadius: "20px", border: "none",
              background: activeVibe === v.label ? "#1db954" : "#151515",
              color: activeVibe === v.label ? "#000" : "#777",
              fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: "all 0.15s"
            }}>
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <div>
          <div className="label" style={{ marginBottom: "8px" }}>Describe a vibe</div>
          <input value={vibe} onChange={e => { setVibe(e.target.value); setActiveVibe(null); }}
            placeholder='"sad late night" or "sunday morning chill"'
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
              background: "#111", border: "1px solid #1a1a1a",
              color: "#fff", fontSize: "14px", outline: "none" }} />
        </div>
        <div>
          <div className="label" style={{ marginBottom: "8px" }}>Start from a song in your library</div>
          <input value={seedSong} onChange={e => setSeedSong(e.target.value)}
            placeholder='"Broken Head" or "Pyramids"'
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
              background: "#111", border: "1px solid #1a1a1a",
              color: "#fff", fontSize: "14px", outline: "none" }} />
        </div>
      </div>

      {/* Advanced filters toggle */}
      <button onClick={() => setShowFilters(!showFilters)} style={{
        background: "none", border: "none", color: "#444", fontSize: "13px",
        cursor: "pointer", marginBottom: "16px", padding: 0
      }}>
        {showFilters ? "▼" : "▶"} Advanced filters
      </button>

      {showFilters && (
        <div style={{ background: "#0e0e0e", borderRadius: "12px", padding: "20px",
          marginBottom: "16px", border: "1px solid #1a1a1a",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Artists to base on</div>
            <input value={artists} onChange={e => setArtists(e.target.value)}
              placeholder="Drake, Mac Miller, ..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none" }} />
            <div style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>Comma-separated</div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none" }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Mood</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["any","happy","dark"].map(m => (
                <button key={m} onClick={() => setMood(m)} style={{
                  flex: 1, padding: "10px 0", borderRadius: "8px", border: "none",
                  background: mood === m ? "#1db954" : "#111",
                  color: mood === m ? "#000" : "#555",
                  fontWeight: 600, fontSize: "12px", cursor: "pointer",
                  textTransform: "capitalize"
                }}>{m}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Min BPM</div>
            <input type="number" value={minTempo} onChange={e => setMinTempo(e.target.value)}
              placeholder="e.g. 90"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none" }} />
          </div>

          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Max BPM</div>
            <input type="number" value={maxTempo} onChange={e => setMaxTempo(e.target.value)}
              placeholder="e.g. 130"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px",
                background: "#111", border: "1px solid #222",
                color: "#fff", fontSize: "13px", outline: "none" }} />
          </div>
        </div>
      )}

      {/* Generate */}
      <button onClick={discover} disabled={loading} style={{
        width: "100%", padding: "16px", borderRadius: "12px", border: "none",
        background: loading ? "#1a1a1a" : "#1db954",
        color: loading ? "#555" : "#000",
        fontWeight: 700, fontSize: "16px", cursor: loading ? "default" : "pointer",
        marginBottom: "36px", transition: "all 0.2s"
      }}>
        {loading ? "Building your playlist..." : "Generate Playlist →"}
      </button>

      {/* Context card */}
      {ctx && !loading && (
        <div style={{ background: "#0e0e0e", borderRadius: "12px", padding: "14px 20px",
          marginBottom: "28px", display: "flex", gap: "24px", flexWrap: "wrap",
          border: "1px solid #1a1a1a", fontSize: "13px" }}>
          {[
            ["Time", `${ctx.time_of_day} (${ctx.hour}:00)`],
            ["Energy target", `${Math.round(ctx.target_features.energy * 100)}%`],
            ["Mood target", `${Math.round(ctx.target_features.valence * 100)}%`],
            ["BPM target", `${Math.round(ctx.target_features.tempo)}`],
            ["Hour data", ctx.used_hour_data ? "✓ yes" : "not enough yet"],
            ["Recent data", ctx.used_recent_data ? "✓ yes" : "not enough yet"],
            ...(ctx.artists_filter ? [["Artists", ctx.artists_filter.join(", ")]] : []),
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: "#444", fontSize: "11px", textTransform: "uppercase",
                letterSpacing: "1px", marginBottom: "3px" }}>{label}</div>
              <div style={{ color: "#fff", fontWeight: 600 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Library matches */}
      {data?.library_matches?.length > 0 && !loading && (
        <div style={{ marginBottom: "28px" }}>
          <div className="label" style={{ marginBottom: "12px", color: "#1db954" }}>
            FROM YOUR LIBRARY — songs you already love that fit this vibe
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {data.library_matches.map((t, i) => <LibraryTrack key={i} track={t} />)}
          </div>
        </div>
      )}

      {/* New discoveries */}
      {data?.tracks?.filter(t => !t.from_library).length > 0 && !loading && (
        <div>
          <div className="label" style={{ marginBottom: "12px" }}>
            NEW DISCOVERIES — not in your library yet
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {data.tracks.filter(t => !t.from_library).map((t, i) => (
              <DiscoveryTrack key={i} track={t} />
            ))}
          </div>
        </div>
      )}

      {!data && !loading && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#222" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🎵</div>
          <div style={{ fontSize: "16px" }}>Pick a vibe or describe what you want.</div>
          <div style={{ fontSize: "13px", marginTop: "8px", color: "#1a1a1a" }}>
            The more you use Fidolio, the more personal the recommendations get.
          </div>
        </div>
      )}
    </div>
  );
}