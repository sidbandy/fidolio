import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import { C, TYPE, FONT, input, SECTION, PAGE_BG, btn, PANEL, SHEEN } from "../theme";
import { useRef } from "react";
import { Card, Department, Expander, Input, Button, TrackRow, EmptyState, Modal, Reveal, FlipCard } from "../ui";
import Masthead from "../ui/Masthead";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIMIT = 50;

// Section 3 = forest green.
const AC = SECTION[3].color;  // #3C8A57 — forest green.
const AW = SECTION[3].wash;   // rgba(60,138,87,0.20) — green wash for "yours" / active states
const AC_ON = SECTION[3].on;  // #FFFFFF (white — on green fills)
const AON = AC_ON;

const QUICK_VIBES = [
  { label: "🌙 Late Night", params: { max_valence: 0.4, max_energy: 0.55 } },
  { label: "⚡ High Energy", params: { min_energy: 0.8, min_tempo: 125 } },
  { label: "😢 Sad Hours", params: { max_valence: 0.3, max_energy: 0.45 } },
  { label: "☀️ Good Vibes", params: { min_valence: 0.65, min_energy: 0.55 } },
  { label: "🎸 Acoustic", params: { min_acousticness: 0.65 } },
  { label: "🕺 Dance Floor", params: { min_danceability: 0.75, min_energy: 0.65 } },
  { label: "🧠 Focus", params: { max_energy: 0.45, max_speechiness: 0.1 } },
  { label: "💿 2010s", params: { min_year: 2010, max_year: 2019 } },
];
const LANGUAGES = ["", "english", "hindi", "bengali", "arabic", "spanish", "french", "portuguese", "japanese", "chinese", "punjabi", "tamil", "urdu"];
const NLP_SUGGEST = ["chill late night vibes", "sad slow songs", "hype workout bangers", "chill bengali songs", "dark electronic", "focus study no lyrics"];
const FORYOU_VIBES = [
  { label: "Late Night", emoji: "🌙", value: "late night 2am insomnia" },
  { label: "Hype", emoji: "⚡", value: "hype energetic banger rage" },
  { label: "Sad Hours", emoji: "💙", value: "sad melancholy heartbreak emotional" },
  { label: "Deep Focus", emoji: "🧠", value: "study focus productive concentrate" },
  { label: "Good Vibes", emoji: "☀️", value: "happy upbeat feel good joyful" },
  { label: "Acoustic", emoji: "🎸", value: "acoustic folk raw stripped" },
  { label: "Dance Floor", emoji: "🕺", value: "party dance groove floor" },
  { label: "Driving", emoji: "🚗", value: "driving road trip highway" },
];
const FORYOU_LANGS = [
  { value: "en", label: "English only" },
  { value: "en+hi", label: "English + Hindi" },
  { value: "en+hi+bn", label: "English + Hindi + Bengali" },
  { value: "any", label: "Any language" },
];

// Editorial sub-tab: boxy, ink-bordered toggle — not rounded pills.
const subTab = (active) => ({
  padding: "8px 16px", borderRadius: 4, border: "none", cursor: "pointer",
  fontSize: 12.5, fontWeight: 700, fontFamily: FONT.ui, textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: active ? C.ink : "transparent",
  color: active ? C.bg : C.ink,
  transition: "all 0.15s",
});

// Hard offset shadow — signature raised-card treatment.
const RAISED_SHADOW = "5px 5px 0 rgba(22,17,24,0.15)";
const MODAL_SHADOW  = "8px 8px 0 rgba(22,17,24,0.18)";

/* ─────────────────────────── SEARCH ─────────────────────────── */
function SearchView() {
  const [mode, setMode] = useState("nlp");
  const [nlpQuery, setNlpQuery] = useState("");
  const [interpreted, setInterpreted] = useState(null);
  const [results, setResults] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [textQ, setTextQ] = useState(""); const [artistFilter, setArtistFilter] = useState("");
  const [minTempo, setMinTempo] = useState(""); const [maxTempo, setMaxTempo] = useState("");
  const [minEnergy, setMinEnergy] = useState(""); const [maxEnergy, setMaxEnergy] = useState("");
  const [minValence, setMinValence] = useState(""); const [maxValence, setMaxValence] = useState("");
  const [minYear, setMinYear] = useState(""); const [maxYear, setMaxYear] = useState("");
  const [language, setLanguage] = useState(""); const [activeVibe, setActiveVibe] = useState(null);
  const [saving, setSaving] = useState(false); const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false); const [saveResult, setSaveResult] = useState(null);
  const { playing, play } = usePreview();

  const nlpSearch = async () => {
    if (!nlpQuery.trim()) return;
    setLoading(true); setInterpreted(null); setSaveResult(null);
    const res = await fetch(`${API}/search/nlp?q=${encodeURIComponent(nlpQuery)}&limit=${LIMIT}`);
    const data = await res.json();
    setResults(data.results || []); setTotal(data.total || 0); setInterpreted(data.interpreted); setLoading(false);
  };
  const filterSearch = async (extra = {}) => {
    setLoading(true); setInterpreted(null); setSaveResult(null);
    const p = new URLSearchParams();
    const set = (k, v) => v && p.set(k, v);
    set("q", textQ); set("artist", artistFilter); set("min_tempo", minTempo); set("max_tempo", maxTempo);
    set("min_energy", minEnergy); set("max_energy", maxEnergy); set("min_valence", minValence); set("max_valence", maxValence);
    set("min_year", minYear); set("max_year", maxYear); set("language", language);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    p.set("limit", String(LIMIT));
    const res = await fetch(`${API}/search/?${p}`); const data = await res.json();
    setResults(data.results || []); setTotal(data.total || 0); setLoading(false);
  };
  const saveAsPlaylist = async () => {
    if (!results?.length || !saveName.trim()) return;
    setSaving(true); setSaveResult(null);
    const res = await fetch(`${API}/playlists/from-tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: saveName.trim(), track_ids: results.map((t) => t.id) }) });
    const data = await res.json(); setSaveResult(data); setSaving(false); if (data.success) setShowSave(false);
  };
  const weatherSearch = () => {
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const res = await fetch(`${API}/search/weather-vibe?lat=${lat}&lon=${lon}&limit=25`);
      const data = await res.json();
      if (data.error) return setWeatherLoading(false);
      setWeatherData(data.weather); setResults(data.results || []); setTotal(data.results?.length || 0); setInterpreted(data.weather?.explanation); setWeatherLoading(false);
    }, () => { alert("Location access needed for weather search."); setWeatherLoading(false); });
  };
  const resetFilters = () => {
    setTextQ(""); setArtistFilter(""); setMinTempo(""); setMaxTempo(""); setMinEnergy(""); setMaxEnergy("");
    setMinValence(""); setMaxValence(""); setMinYear(""); setMaxYear(""); setLanguage(""); setActiveVibe(null);
    setResults(null); setInterpreted(null); setWeatherData(null); setSaveResult(null);
  };

  const RangeRow = ({ label, a, setA, b, setB, step }) => (
    <div>
      <div style={{ ...TYPE.micro, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <Input type="number" step={step} value={a} onChange={(e) => setA(e.target.value)} placeholder="Min" style={{ width: "50%" }} />
        <Input type="number" step={step} value={b} onChange={(e) => setB(e.target.value)} placeholder="Max" style={{ width: "50%" }} />
      </div>
    </div>
  );

  return (
    <Reveal>
      {/* Weather Station — the prominent, cool "tune to your sky" filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 20px", marginBottom: 22, background: PANEL, border: `1.5px solid ${weatherData ? AC : C.border2}`, borderRadius: 6, boxShadow: SHEEN, flexWrap: "wrap" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: AW, border: `1px solid ${AC}`, flexShrink: 0 }}>
          <WeatherIcon size={26} color={AC} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.6px", color: AC }}>Weather Station</div>
          <div style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 800, color: C.ink, marginTop: 4, letterSpacing: "-0.01em" }}>
            {weatherData ? `${Math.round(weatherData.temperature)}°C — tuned to your sky` : "Match your music to the sky outside"}
          </div>
          {weatherData?.explanation && <div style={{ fontSize: 12, fontFamily: FONT.mono, color: C.sub, marginTop: 4 }}>{weatherData.explanation}</div>}
        </div>
        <button onClick={weatherSearch} style={btn("primary", { whiteSpace: "nowrap" })}>
          {weatherLoading ? "Reading the sky…" : weatherData ? "Re-read ↻" : "Tune to weather →"}
        </button>
      </div>

      {/* Mode toggle — boxy editorial, not pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "transparent", border: `1.5px solid ${C.border2}`, borderRadius: 6 }}>
          <button onClick={() => { setMode("nlp"); setResults(null); }} style={subTab(mode === "nlp")}>Describe It</button>
          <button onClick={() => { setMode("filters"); setResults(null); }} style={subTab(mode === "filters")}>Use Filters</button>
        </div>
      </div>

      {mode === "nlp" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <Input value={nlpQuery} onChange={(e) => setNlpQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nlpSearch()} autoFocus placeholder='Try: "sad slow songs" or "chill acoustic 90s"' style={{ flex: 1, minWidth: 220, padding: "13px 18px", fontSize: 15 }} />
            <Button onClick={nlpSearch} style={{ padding: "13px 26px", fontSize: 15 }}>Search</Button>
          </div>
          {/* Interpreted chip — lime fill with ink text */}
          {interpreted && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: AW, border: `1.5px solid ${C.ink}`, borderRadius: 4, padding: "7px 14px", fontSize: 12, fontFamily: FONT.mono }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>✓ Interpreted as:</span>
              <span style={{ color: C.sub }}>{interpreted}</span>
            </div>
          )}
          {/* NLP suggestion chips — boxy editorial mono tags */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {NLP_SUGGEST.map((s) => (
              <button key={s} onClick={() => setNlpQuery(s)} style={{
                padding: "6px 12px", borderRadius: 3, border: `1px solid ${C.border2}`,
                background: "transparent", color: C.sub, cursor: "pointer",
                fontSize: 11.5, fontFamily: FONT.mono, letterSpacing: "0.02em",
                transition: "all 0.15s",
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {mode === "filters" && (
        <div style={{ marginBottom: 24 }}>
          <Card style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div><div style={{ ...TYPE.micro, marginBottom: 6 }}>Text search</div><Input value={textQ} onChange={(e) => setTextQ(e.target.value)} placeholder="Song, album…" style={{ width: "100%" }} /></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 6 }}>Artist</div><Input value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)} placeholder="Artist name…" style={{ width: "100%" }} /></div>
            <RangeRow label="BPM range" a={minTempo} setA={setMinTempo} b={maxTempo} setB={setMaxTempo} />
            <RangeRow label="Energy (0–1)" a={minEnergy} setA={setMinEnergy} b={maxEnergy} setB={setMaxEnergy} step="0.1" />
            <RangeRow label="Mood (0–1)" a={minValence} setA={setMinValence} b={maxValence} setB={setMaxValence} step="0.1" />
            <RangeRow label="Release year" a={minYear} setA={setMinYear} b={maxYear} setB={setMaxYear} />
            <div>
              <div style={{ ...TYPE.micro, marginBottom: 6 }}>Language</div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={input({ width: "100%", cursor: "pointer", color: language ? C.ink : C.muted })}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l === "" ? "Any language" : l[0].toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </Card>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => filterSearch()} style={{ padding: "12px 30px" }}>Search</Button>
            <Button variant="ghost" onClick={resetFilters} style={{ padding: "12px 20px" }}>Reset</Button>
          </div>
        </div>
      )}

      {loading && <div style={{ ...TYPE.body, padding: "30px 0" }}>Searching your library…</div>}

      {results && !loading && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div style={{ ...TYPE.micro, color: C.muted }}>{results.length} songs{total > results.length ? ` of ${total.toLocaleString()} matches` : ""}</div>
            {results.length > 0 && (saveResult?.success ? (
              <a href={saveResult.playlist_url} target="_blank" rel="noreferrer" style={{ ...btn("primary"), textDecoration: "none" }}>Open in Spotify ↗</a>
            ) : (
              <Button onClick={() => { setShowSave(true); setSaveResult(null); setSaveName(interpreted ? `Fidolio: ${interpreted}` : "Fidolio Search"); }}>+ Save as Playlist</Button>
            ))}
          </div>
          {results.length === 0 ? <EmptyState title="No songs found" hint="Try a different description or fewer filters." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{results.map((t) => <TrackRow key={t.id} track={t} playing={playing} onPlay={play} />)}</div>
          )}
        </>
      )}

      {!results && !loading && <EmptyState icon="🔍" title="Describe what you want to hear" hint="Natural language, filters, or your local weather." />}

      <Modal open={showSave} onClose={() => setShowSave(false)}>
        <div style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Save as Spotify Playlist</div>
        <div style={{ ...TYPE.body, fontSize: 12, marginBottom: 16 }}>Creates a playlist with these {results?.length || 0} songs.</div>
        <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveAsPlaylist()} autoFocus placeholder="Playlist name" style={{ width: "100%", marginBottom: 16, padding: "11px 14px", fontSize: 14 }} />
        {saveResult && !saveResult.success && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{saveResult.error || "Could not create playlist."}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setShowSave(false)}>Cancel</Button>
          <Button onClick={saveAsPlaylist} disabled={saving || !saveName.trim()}>{saving ? "Creating…" : "Create Playlist"}</Button>
        </div>
      </Modal>
    </Reveal>
  );
}

/* ─────────────────────────── FOR YOU ─────────────────────────── */
function ForYouTrack({ track, fromLibrary }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 4, background: fromLibrary ? AW : C.card, border: `1.5px solid ${fromLibrary ? C.ink : C.line}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 3, background: fromLibrary ? AC : C.card2, color: fromLibrary ? AC_ON : C.muted, border: `1.5px solid ${fromLibrary ? C.ink : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, fontFamily: FONT.mono, fontWeight: 700 }}>{fromLibrary ? "✓" : "♪"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, display: "flex", alignItems: "center", gap: 8, fontFamily: FONT.ui }}>
          {track.name}
          {track.already_saved && !fromLibrary && <span style={{ fontSize: 10, color: AC_ON, background: AC, padding: "2px 6px", borderRadius: 3, fontFamily: FONT.mono, fontWeight: 700 }}>SAVED</span>}
        </div>
        <div style={{ fontSize: 12, color: fromLibrary ? C.sub : C.sub, marginTop: 2, fontFamily: FONT.body }}>{track.artist}</div>
      </div>
      <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.ink, textDecoration: "none", padding: "5px 11px", borderRadius: 3, border: `1.5px solid ${C.ink}`, fontFamily: FONT.mono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Open ↗</a>
    </div>
  );
}
function ForYouView() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false); const [activeVibe, setActiveVibe] = useState(null);
  const [vibe, setVibe] = useState(""); const [seedSong, setSeedSong] = useState(""); const [artists, setArtists] = useState("");
  const [language, setLanguage] = useState("en"); const [minTempo, setMinTempo] = useState(""); const [maxTempo, setMaxTempo] = useState(""); const [mood, setMood] = useState("any");

  const discover = async () => {
    setLoading(true); setData(null);
    const p = new URLSearchParams();
    if (vibe) p.set("vibe", vibe); if (seedSong) p.set("seed_song", seedSong); if (artists) p.set("artists", artists);
    p.set("language", language); p.set("size", "22");
    if (minTempo) p.set("min_tempo", minTempo); if (maxTempo) p.set("max_tempo", maxTempo);
    if (mood === "happy") p.set("min_valence", "0.6"); if (mood === "dark") p.set("max_valence", "0.35");
    try { const res = await fetch(`${API}/discovery/for-me?${p}`); setData(await res.json()); } catch (e) { console.error(e); }
    setLoading(false);
  };
  const ctx = data?.context;
  const newOnes = data?.tracks?.filter((t) => !t.from_library) || [];

  return (
    <Reveal>
      <div style={{ ...TYPE.micro, marginBottom: 12 }}>Quick vibe</div>
      {/* Quick-vibe chips — boxy editorial, de-pilled */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {FORYOU_VIBES.map((v) => (
          <button key={v.label} onClick={() => { setActiveVibe(v.label); setVibe(v.value); }} style={{
            padding: "8px 14px", borderRadius: 3, border: `1.5px solid ${activeVibe === v.label ? C.ink : C.border2}`,
            background: activeVibe === v.label ? C.ink : "transparent",
            color: activeVibe === v.label ? C.bg : C.ink,
            cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONT.ui,
            transition: "all 0.15s", userSelect: "none",
          }}>{v.emoji} {v.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 20 }}>
        <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Describe a vibe</div><Input value={vibe} onChange={(e) => { setVibe(e.target.value); setActiveVibe(null); }} placeholder='"sad late night"' style={{ width: "100%", padding: "12px 16px", fontSize: 14 }} /></div>
        <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Start from a song you own</div><Input value={seedSong} onChange={(e) => setSeedSong(e.target.value)} placeholder='"Pyramids"' style={{ width: "100%", padding: "12px 16px", fontSize: 14 }} /></div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Expander label="Advanced filters" sublabel="artists · language · mood · BPM">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, paddingTop: 6 }}>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Artists to base on</div><Input value={artists} onChange={(e) => setArtists(e.target.value)} placeholder="Drake, Mac Miller…" style={{ width: "100%" }} /></div>
            <div>
              <div style={{ ...TYPE.micro, marginBottom: 8 }}>Language</div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={input({ width: "100%", cursor: "pointer" })}>{FORYOU_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
            </div>
            {/* Mood filter — boxy editorial tags */}
            <div>
              <div style={{ ...TYPE.micro, marginBottom: 8 }}>Mood</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["any", "happy", "dark"].map((m) => (
                  <button key={m} onClick={() => setMood(m)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 3,
                    border: `1.5px solid ${mood === m ? C.ink : C.border2}`,
                    background: mood === m ? C.ink : "transparent",
                    color: mood === m ? C.bg : C.ink,
                    cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONT.ui,
                    textTransform: "capitalize", minHeight: 38, transition: "all 0.15s",
                  }}>{m}</button>
                ))}
              </div>
            </div>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Min BPM</div><Input type="number" value={minTempo} onChange={(e) => setMinTempo(e.target.value)} placeholder="90" style={{ width: "100%" }} /></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Max BPM</div><Input type="number" value={maxTempo} onChange={(e) => setMaxTempo(e.target.value)} placeholder="130" style={{ width: "100%" }} /></div>
          </div>
        </Expander>
      </div>

      <Button onClick={discover} disabled={loading} style={{ width: "100%", padding: 16, fontSize: 16, marginBottom: 32 }}>{loading ? "Building your playlist…" : "Generate Playlist →"}</Button>

      {/* Context data strip */}
      {ctx && !loading && (
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", padding: "4px 2px", marginBottom: 28, fontFamily: FONT.mono, fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {[["Time", `${ctx.time_of_day} (${ctx.hour}:00)`], ["Energy", `${Math.round(ctx.target_features.energy * 100)}%`], ["Mood", `${Math.round(ctx.target_features.valence * 100)}%`], ["BPM", `${Math.round(ctx.target_features.tempo)}`], ["Hour data", ctx.used_hour_data ? "✓" : "—"], ["Recent data", ctx.used_recent_data ? "✓" : "—"]].map(([l, v]) => (
            <span key={l}>{l} <b style={{ color: C.ink }}>{v}</b></span>
          ))}
        </div>
      )}

      {data?.library_matches?.length > 0 && !loading && (
        <div style={{ marginBottom: 28 }}>
          <Department no="—" title="From Your Library" right={<span style={{ ...TYPE.micro, color: C.sub }}>songs you already love</span>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{data.library_matches.map((t, i) => <ForYouTrack key={i} track={t} fromLibrary />)}</div>
        </div>
      )}
      {newOnes.length > 0 && !loading && (
        <div>
          <Department no="—" title="New Discoveries" right={<span style={{ ...TYPE.micro, color: C.muted }}>not in your library yet</span>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{newOnes.map((t, i) => <ForYouTrack key={i} track={t} />)}</div>
        </div>
      )}
      {!data && !loading && <EmptyState icon="🎵" title="Pick a vibe or describe what you want" hint="The more you use Fidolio, the more personal it gets." />}
    </Reveal>
  );
}

/* ─────────────────────────── ALBUMS ─────────────────────────── */
function ScoreBar({ score }) {
  const p = Math.round((score || 0) * 100);
  return (
    <div style={{ height: 4, width: 70, background: C.border2, flexShrink: 0 }}>
      <div style={{ height: 4, background: p > 65 ? AC : p > 40 ? C.amber : C.indigo, width: `${p}%`, transition: "width 0.4s" }} />
    </div>
  );
}
function AlbumsView() {
  const [albumName, setAlbumName] = useState(""); const [artistName, setArtistName] = useState("");
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  const [trackSort, setTrackSort] = useState("order"); // "order" | "match"
  const [onlyNew, setOnlyNew] = useState(false);
  const [topAlbums, setTopAlbums] = useState([]);
  const tab = "explorer";

  // Data-driven starting points: real albums from your library (no hardcoded picks).
  useEffect(() => {
    fetch(`${API}/stats/top-albums-rich?limit=12`).then((r) => r.json())
      .then((d) => setTopAlbums(d.albums || [])).catch(() => {});
  }, []);

  const exploreAlbum = async (al = albumName, ar = artistName) => {
    if (!al || !ar) return;
    setAlbumName(al); setArtistName(ar);
    setLoading(true); setData(null);
    try { const res = await fetch(`${API}/albums/explore?album_name=${encodeURIComponent(al)}&artist_name=${encodeURIComponent(ar)}`); setData(await res.json()); }
    catch { setData({ found: false, message: "Request failed — try again" }); }
    setLoading(false);
  };
  const fitLabel = (s) => s >= 0.7 ? { text: "Strong match for your taste", color: AC } : s >= 0.5 ? { text: "Decent fit for your taste", color: C.amber } : { text: "Outside your usual taste", color: C.indigo };

  let albumTracks = data?.tracks ? [...data.tracks] : [];
  if (onlyNew) albumTracks = albumTracks.filter((t) => !t.already_saved);
  if (trackSort === "match") albumTracks.sort((a, b) => (b.taste_score || 0) - (a.taste_score || 0));

  return (
    <Reveal>
      {/* Album Lens starters — real covers pulled from your library (data-driven, no hardcoding) */}
      {topAlbums.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...TYPE.micro, marginBottom: 12 }}>Start with one of yours</div>
          <div style={{ display: "flex", gap: 13, overflowX: "auto", paddingBottom: 6 }}>
            {topAlbums.map((al) => (
              <button key={`${al.album}-${al.artist}`} onClick={() => exploreAlbum(al.album, al.artist)} className="lift"
                title={`${al.album} — ${al.artist}`}
                style={{ flexShrink: 0, width: 98, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <div style={{ width: 98, height: 98, borderRadius: 4, overflow: "hidden", border: `1.5px solid ${C.ink}`, background: C.card2, boxShadow: RAISED_SHADOW }}>
                  {al.cover
                    ? <img src={al.cover} alt={al.album} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: C.faint }}>{(al.album || "?").trim()[0]?.toUpperCase()}</div>}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, marginTop: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.ui }}>{al.album}</div>
                <div style={{ fontSize: 10.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.body }}>{al.artist}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "explorer" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Album name</div><Input value={albumName} onChange={(e) => setAlbumName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && exploreAlbum()} placeholder="e.g. Swimming" style={{ width: "100%", padding: "12px 16px", fontSize: 14 }} /></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Artist</div><Input value={artistName} onChange={(e) => setArtistName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && exploreAlbum()} placeholder="e.g. Mac Miller" style={{ width: "100%", padding: "12px 16px", fontSize: 14 }} /></div>
          </div>
          <Button onClick={exploreAlbum} disabled={loading || !albumName || !artistName} style={{ width: "100%", padding: 14, fontSize: 15, marginBottom: 28 }}>{loading ? "Exploring…" : "Explore Album →"}</Button>

          {data && !loading && !data.found && <EmptyState title="Album not found" hint={data.message} />}
          {data?.found && !loading && (
            <>
              <Card style={{ marginBottom: 20, boxShadow: RAISED_SHADOW }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h2 style={{ ...TYPE.section, fontSize: 24 }}>{data.album.name}</h2>
                    <p style={{ color: C.sub, marginTop: 4, fontFamily: FONT.body }}>{data.album.artist}</p>
                    {data.album.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                        {data.album.tags.map((t) => (
                          <span key={t} style={{ fontSize: 11, color: C.ink, background: AW, padding: "3px 10px", borderRadius: 3, border: `1px solid ${C.border2}`, fontFamily: FONT.mono, fontWeight: 600 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ ...TYPE.stat, fontSize: 30, color: fitLabel(data.taste_comparison.overall_fit).color }}>{Math.round(data.taste_comparison.overall_fit * 100)}%</div>
                    <div style={{ ...TYPE.micro, marginTop: 4 }}>taste match</div>
                    <div style={{ fontSize: 12, fontFamily: FONT.mono, color: fitLabel(data.taste_comparison.overall_fit).color, marginTop: 4 }}>{fitLabel(data.taste_comparison.overall_fit).text}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 20 }}>
                  {[{ label: "Energy", yours: data.taste_comparison.your_energy, album: data.taste_comparison.album_energy }, { label: "Mood", yours: data.taste_comparison.your_valence, album: data.taste_comparison.album_valence }].map((row) => (
                    <div key={row.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.micro, marginBottom: 6 }}><span>{row.label}</span><span>You {Math.round((row.yours || 0) * 100)}% · Album {Math.round((row.album || 0) * 100)}%</span></div>
                      <div style={{ height: 4, background: C.border2, position: "relative" }}>
                        <div style={{ position: "absolute", height: 4, background: C.faint, width: `${(row.album || 0) * 100}%` }} />
                        <div style={{ position: "absolute", height: 4, background: AC, width: 2, left: `${(row.yours || 0) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 16, fontFamily: FONT.mono, fontSize: 12, color: C.sub }}><span>{data.album.track_count} tracks</span><span>{data.album.you_own} already in your library</span></div>
              </Card>

              {data.entry_points?.length > 0 && (
                <Card style={{ background: AW, border: `1.5px solid ${C.ink}`, marginBottom: 20, boxShadow: RAISED_SHADOW }}>
                  <div style={{ ...TYPE.micro, color: C.ink, marginBottom: 16 }}>Start here — best entry points for your taste</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.entry_points.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 3, background: AC, color: AC_ON, border: `1.5px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0, fontFamily: FONT.display }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: FONT.ui }}>{t.name}</div><div style={{ fontSize: 11, color: C.sub, marginTop: 2, fontFamily: FONT.mono }}>{Math.round(t.taste_score * 100)}% match</div></div>
                        {t.spotify_url && <a href={t.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.ink, textDecoration: "none", padding: "5px 10px", border: `1.5px solid ${C.ink}`, borderRadius: 3, fontFamily: FONT.mono, fontWeight: 700, textTransform: "uppercase" }}>Open ↗</a>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                  <div style={{ ...TYPE.micro }}>Full track list</div>
                  {/* Track sort chips — boxy editorial */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {[["order", "Album order"], ["match", "Best match"]].map(([val, lbl]) => (
                      <button key={val} onClick={() => setTrackSort(val)} style={{
                        padding: "5px 11px", borderRadius: 3,
                        border: `1.5px solid ${trackSort === val ? C.ink : C.border2}`,
                        background: trackSort === val ? C.ink : "transparent",
                        color: trackSort === val ? C.bg : C.ink,
                        cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: FONT.ui,
                        transition: "all 0.15s",
                      }}>{lbl}</button>
                    ))}
                    <button onClick={() => setOnlyNew((v) => !v)} style={{
                      padding: "5px 11px", borderRadius: 3,
                      border: `1.5px solid ${onlyNew ? C.ink : C.border2}`,
                      background: onlyNew ? C.ink : "transparent",
                      color: onlyNew ? C.bg : C.ink,
                      cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: FONT.ui,
                      transition: "all 0.15s",
                    }}>New to me</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {albumTracks.length === 0 && (
                    <div style={{ ...TYPE.body, fontSize: 12.5, color: C.sub, padding: "8px 4px" }}>
                      {onlyNew ? "You already own every track on this album — nothing new here." : "No tracks to show."}
                    </div>
                  )}
                  {albumTracks.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px" }}>
                      <span style={{ color: C.faint, fontSize: 12, width: 20, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums", fontFamily: FONT.mono }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: t.recommended_entry ? 600 : 400, color: C.ink, display: "flex", alignItems: "center", gap: 6, fontFamily: FONT.ui }}>
                          {t.name}
                          {t.already_saved && <span style={{ fontSize: 10, color: AC_ON, background: AC, padding: "1px 5px", borderRadius: 3, fontFamily: FONT.mono, fontWeight: 700 }}>SAVED</span>}
                          {t.recommended_entry && !t.already_saved && <span style={{ fontSize: 10, color: C.ink, background: C.amberBg, padding: "1px 5px", borderRadius: 3, fontFamily: FONT.mono, fontWeight: 700, border: `1px solid ${C.amber}` }}>REC</span>}
                        </div>
                      </div>
                      <ScoreBar score={t.taste_score} />
                      {t.spotify_url && <a href={t.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.muted, textDecoration: "none", flexShrink: 0, fontFamily: FONT.mono }}>↗</a>}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}

    </Reveal>
  );
}

/* ─────────────────────────── BLIND SPOTS (flip cards) ─────────────────────────── */
// Editorial tag chip — boxy, ink-bordered, no lozenges.
const chip = { fontSize: 11, color: C.ink, background: C.card2, border: `1px solid ${C.border2}`, padding: "3px 9px", borderRadius: 3, whiteSpace: "nowrap", fontFamily: FONT.mono, fontWeight: 600 };
const faceHint = { marginTop: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.muted, paddingTop: 10, textAlign: "right", textTransform: "uppercase", letterSpacing: "0.06em" };

function BlindFront({ spot, meaning, meaningOpen, onInfo }) {
  return (
    <div style={{ height: "100%", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: RAISED_SHADOW }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 800, textTransform: "capitalize", letterSpacing: "-0.01em", color: C.ink, overflow: "hidden", textOverflow: "ellipsis" }}>{spot.genre}</div>
          <button onClick={(e) => { e.stopPropagation(); onInfo(); }} aria-label="What does this mean?"
            style={{ width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${C.border2}`, background: meaningOpen ? AC : "transparent", color: meaningOpen ? AC_ON : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, lineHeight: 1, fontFamily: FONT.mono }}>i</button>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: C.indigo }}>{spot.songs_in_library}</div>
          <div style={{ ...TYPE.micro, color: C.muted }}>songs</div>
        </div>
      </div>
      {meaningOpen && (
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: 8, background: C.card2, border: `1px solid ${C.border2}`, borderRadius: 4, padding: "8px 10px", fontFamily: FONT.body }}>
          {meaning === undefined ? "Loading…" : meaning || "No quick definition found."}
        </div>
      )}
      <div style={{ ...TYPE.micro, marginTop: 14, marginBottom: 6 }}>You have it via</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {spot.artists_you_have.slice(0, 4).map((a) => <span key={a} style={chip}>{a}</span>)}
      </div>
      {spot.songs?.length > 0 && (
        <>
          <div style={{ ...TYPE.micro, marginBottom: 6 }}>Best-fit songs you own</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {spot.songs.slice(0, 3).map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.body }}><span style={{ color: C.ink, fontWeight: 600 }}>{s.name}</span> · {s.artist}</div>
            ))}
          </div>
        </>
      )}
      <div style={faceHint}>tap to flip ⤿</div>
    </div>
  );
}

function BlindBack({ spot, det, playing, play }) {
  const loading = !det || det.loading;
  const tracks = det?.recommended_tracks || [];
  const top = tracks[0];
  const rest = tracks.slice(1, 3);
  const topId = top ? `bs-${spot.genre}-${top.artist}` : null;
  return (
    <div style={{ height: "100%", background: AW, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: RAISED_SHADOW }}>
      <div style={{ ...TYPE.micro, color: C.ink, marginBottom: 4 }}>Go deeper into {spot.genre}</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, fontFamily: FONT.body }}>Different artists you don't own — tap ▶ to taste the first.</div>
      {loading ? <div style={{ ...TYPE.body, fontSize: 12 }}>Finding artists…</div> :
        top ? (
          <>
            {/* "Raised/previewable" top track — amber-accented panel, dark ink text */}
            <div onClick={(e) => e.stopPropagation()} style={{ borderRadius: 4, border: `2px solid ${AC}`, background: C.card, boxShadow: MODAL_SHADOW, marginBottom: 12 }}>
              <TrackRow track={{ id: topId, name: top.track, artist: top.artist }} playing={playing} onPlay={play} note="play next" />
            </div>
            {rest.map((t, i) => (
              <a key={i} href={`https://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.track)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 4px" }}>
                <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: C.ink, width: 16 }}>{i + 2}</span>
                <span style={{ flex: 1, fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.ui }}>{t.track} <span style={{ color: C.sub }}>· {t.artist}</span></span>
                <span style={{ fontSize: 11, color: C.sub, fontFamily: FONT.mono }}>↗</span>
              </a>
            ))}
          </>
        ) : det.recommended_artists?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {det.recommended_artists.map((a, i) => (
              <a key={a} href={`https://open.spotify.com/search/${encodeURIComponent(a)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: C.ink, width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.ui }}>{a}</span>
                <span style={{ fontSize: 11, color: C.sub, fontFamily: FONT.mono }}>↗</span>
              </a>
            ))}
          </div>
        ) : <div style={{ ...TYPE.body, fontSize: 12 }}>No fresh recommendations found.</div>}
      <div style={faceHint}>tap to flip back ⤾</div>
    </div>
  );
}

function BlindSpotsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [meaningOpen, setMeaningOpen] = useState({});
  const [details, setDetails] = useState({});
  const requested = useRef(new Set());
  const { playing, play } = usePreview();

  useEffect(() => {
    fetch(`${API}/albums/blind-spots`).then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const all = data?.blind_spots || [];
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const shown = all.slice(page * pageSize, page * pageSize + pageSize);

  const loadDetail = (spot) => {
    if (requested.current.has(spot.genre)) return;
    requested.current.add(spot.genre);
    setDetails((d) => ({ ...d, [spot.genre]: { loading: true } }));
    fetch(`${API}/albums/blind-spot-detail?genre=${encodeURIComponent(spot.genre)}&artists=${encodeURIComponent(spot.artists_you_have.join(","))}`)
      .then((r) => r.json()).then((det) => setDetails((d) => ({ ...d, [spot.genre]: det })))
      .catch(() => setDetails((d) => ({ ...d, [spot.genre]: { meaning: null, recommended_artists: [] } })));
  };

  useEffect(() => { shown.forEach(loadDetail); /* eslint-disable-next-line */ }, [page, data]);

  return (
    <Reveal>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <p style={{ ...TYPE.body, maxWidth: 520, margin: 0 }}>Niche genres you've brushed against. Tap a card to flip it and see who to explore next.</p>
        {pages > 1 && <Button variant="ghost" onClick={() => { setPage((p) => (p + 1) % pages); setFlipped({}); setMeaningOpen({}); }}>↻ 5 different ones</Button>}
      </div>
      {loading && <div style={{ ...TYPE.body }}>Analyzing your taste… (first load takes a few seconds)</div>}
      {data?.error && <EmptyState title="Blind spots unavailable" hint={data.error} />}
      {!loading && all.length === 0 && <EmptyState title="No blind spots found yet" hint="Save a wider range of artists and check back." />}
      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {shown.map((spot) => {
            const det = details[spot.genre];
            return (
              <FlipCard key={spot.genre} height={300} flipped={!!flipped[spot.genre]}
                onFlip={() => { loadDetail(spot); setFlipped((f) => ({ ...f, [spot.genre]: !f[spot.genre] })); }}
                front={<BlindFront spot={spot} meaning={det && !det.loading ? det.meaning : undefined} meaningOpen={!!meaningOpen[spot.genre]} onInfo={() => { loadDetail(spot); setMeaningOpen((m) => ({ ...m, [spot.genre]: !m[spot.genre] })); }} />}
                back={<BlindBack spot={spot} det={det} playing={playing} play={play} />}
              />
            );
          })}
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────────────────── RABBIT HOLES (deeper) ─────────────────────────── */
function DeeperFront({ h, rank, maxSaved, top, loaded, playing, play }) {
  return (
    <div style={{ height: "100%", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: RAISED_SHADOW }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYPE.micro, color: C.muted }}>Nº {String(rank).padStart(2, "0")}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 800, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.ink }}>{h.artist}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 700, color: AC }}>{h.songs_saved}</div>
          <div style={{ ...TYPE.micro, color: C.muted }}>saved</div>
        </div>
      </div>
      <div style={{ height: 4, background: C.border2, marginTop: 12 }}>
        <div style={{ height: 4, background: AC, width: `${(h.songs_saved / maxSaved) * 100}%` }} />
      </div>
      <div style={{ ...TYPE.micro, color: C.muted, marginTop: 16, marginBottom: 4 }}>
        Play next {top ? (top.plays > 0 ? "· your most-played" : "· best taste-fit") : ""}
      </div>
      {top
        ? <div onClick={(e) => e.stopPropagation()}><TrackRow track={top} playing={playing} onPlay={play} /></div>
        : <div style={{ ...TYPE.body, fontSize: 12, padding: "8px 0" }}>{loaded ? "No previewable track found." : "Loading their tracks…"}</div>}
      <div style={faceHint}>tap for more ⤿</div>
    </div>
  );
}

function DeeperBack({ h, rest }) {
  return (
    <div style={{ height: "100%", background: AW, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: RAISED_SHADOW }}>
      <div style={{ ...TYPE.micro, color: C.ink, marginBottom: 12 }}>More from {h.artist}</div>
      {rest?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rest.map((t, i) => (
            <a key={t.id || i} href={t.spotify_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: C.ink, width: 16 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.ui }}>{t.name}</span>
              {t.plays > 0 && <span style={{ fontSize: 10, color: C.sub, fontFamily: FONT.mono }}>{t.plays}×</span>}
              <span style={{ fontSize: 12, color: C.sub, fontFamily: FONT.mono }}>↗</span>
            </a>
          ))}
        </div>
      ) : <div style={{ ...TYPE.body, fontSize: 12 }}>A focused hole — just the one above.</div>}
      <div style={faceHint}>tap to flip back ⤾</div>
    </div>
  );
}

function DeeperView() {
  const [holes, setHoles] = useState(null);
  const [page, setPage] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [tracks, setTracks] = useState({});
  const requested = useRef(new Set());
  const { playing, play } = usePreview();

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then((d) => setHoles(d.rabbit_holes || [])).catch(() => setHoles([]));
  }, []);

  const all = holes || [];
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const shown = all.slice(page * pageSize, page * pageSize + pageSize);
  const maxSaved = all.length ? Math.max(...all.map((h) => h.songs_saved)) : 1;

  // Per-artist tracks ranked by YOUR plays then taste-fit (distinct per card).
  const loadTracks = (artist) => {
    if (requested.current.has(artist)) return;
    requested.current.add(artist);
    fetch(`${API}/discovery/rabbit-hole-tracks?artist=${encodeURIComponent(artist)}`).then((r) => r.json())
      .then((d) => setTracks((t) => ({ ...t, [artist]: d.tracks || [] }))).catch(() => setTracks((t) => ({ ...t, [artist]: [] })));
  };
  useEffect(() => { shown.forEach((h) => loadTracks(h.artist)); /* eslint-disable-next-line */ }, [page, holes]);

  return (
    <Reveal>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <p style={{ ...TYPE.body, maxWidth: 520, margin: 0 }}>Artists you binged hardest — with the track to play next (most-played or best taste-fit), previewable right here.</p>
        {pages > 1 && <Button variant="ghost" onClick={() => { setPage((p) => (p + 1) % pages); setFlipped({}); }}>↻ 5 different ones</Button>}
      </div>
      {!holes && <div style={{ ...TYPE.body }}>Loading…</div>}
      {holes && all.length === 0 && <EmptyState title="No rabbit holes yet" hint="Save a bunch of one artist in a short window and they'll show up." />}
      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {shown.map((h, idx) => {
            const data = tracks[h.artist];
            return (
              <FlipCard key={h.artist} height={300} flipped={!!flipped[h.artist]}
                onFlip={() => { loadTracks(h.artist); setFlipped((f) => ({ ...f, [h.artist]: !f[h.artist] })); }}
                front={<DeeperFront h={h} rank={page * pageSize + idx + 1} maxSaved={maxSaved} top={data?.[0]} loaded={data !== undefined} playing={playing} play={play} />}
                back={<DeeperBack h={h} rest={data?.slice(1, 4) || []} />}
              />
            );
          })}
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────────────────── FIND (search + albums merged) ─────────────────────────── */

function WeatherIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="8" r="3" />
      <line x1="7.5" y1="2.4" x2="7.5" y2="3.6" />
      <line x1="2" y1="8" x2="3.2" y2="8" />
      <line x1="3.6" y1="4.1" x2="4.4" y2="4.9" />
      <line x1="11.4" y1="4.1" x2="10.6" y2="4.9" />
      <path d="M16.5 19.5H10a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.7 1.4A3 3 0 0 1 16.5 19.5z" />
    </svg>
  );
}

function AlbumRecCard({ a }) {
  const initial = ((a.album || "?").trim()[0] || "?").toUpperCase();
  const href = a.already_saved ? null : `https://open.spotify.com/search/${encodeURIComponent(a.artist + " " + a.album)}`;
  const inner = (
    <div className="lift" style={{ background: C.card, border: `1.5px solid ${a.already_saved ? C.ink : C.line}`, borderRadius: 6, padding: 12, boxShadow: a.already_saved ? RAISED_SHADOW : "none" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", background: C.card2, marginBottom: 10, border: `1px solid ${C.border}` }}>
        {a.cover
          ? <img src={a.cover} alt={a.album} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontSize: 34, fontWeight: 700, color: C.faint }}>{initial}</div>}
        {a.already_saved && (
          <div style={{ position: "absolute", top: 6, left: 6, background: AC, color: AC_ON, fontSize: 9, fontFamily: FONT.mono, fontWeight: 700, padding: "2px 6px", borderRadius: 2 }}>YOURS</div>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.ui }}>{a.album}</div>
      <div style={{ fontSize: 11, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.body }}>{a.artist}</div>
      <div style={{ fontSize: 10.5, color: a.already_saved ? C.sub : C.muted, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.mono }}>
        {a.already_saved ? `★ ${a.owned} in library` : (a.why || "new to you")}{!a.already_saved && " ↗"}
      </div>
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{inner}</a> : inner;
}

// Unified discovery studio: seed 1-2 songs/albums (and/or a vibe) → similar SONGS
// and ALBUMS, owned + new-to-you. Powered by /discovery/recommend.
function RecommendStudio() {
  const { playing, play } = usePreview();
  const [seeds, setSeeds] = useState([]);
  const [seedType, setSeedType] = useState("song");
  const [query, setQuery] = useState("");
  const [sugs, setSugs] = useState([]);
  const [vibe, setVibe] = useState("");
  const [vibeInput, setVibeInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mixes, setMixes] = useState(null);
  const [coords, setCoords] = useState(null);
  const [lang, setLang] = useState("");
  const [mood, setMood] = useState("");
  const [moodList, setMoodList] = useState([]);

  useEffect(() => {
    fetch(`${API}/library/moods`).then((r) => r.json()).then((d) => setMoodList(d.moods || [])).catch(() => {});
  }, []);

  const toggleWeather = () => {
    if (coords) { setCoords(null); return; }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude.toFixed(3), lon: pos.coords.longitude.toFixed(3) }),
      () => {}
    );
  };

  useEffect(() => {
    if (!query.trim()) { setSugs([]); return; }
    const id = setTimeout(() => {
      const url = seedType === "song"
        ? `${API}/search/?q=${encodeURIComponent(query)}&limit=6`
        : `${API}/library/search-albums?q=${encodeURIComponent(query)}&limit=6`;
      fetch(url).then((r) => r.json()).then((d) => {
        setSugs(seedType === "song"
          ? (d.results || d.tracks || []).map((t) => ({ name: t.name, artist: t.artist }))
          : (d.albums || []).map((a) => ({ name: a.album, artist: a.artist })));
      }).catch(() => setSugs([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query, seedType]);

  const addSeed = (s) => {
    if (seeds.length >= 2) return;
    setSeeds((prev) => [...prev, { type: seedType, name: s.name, artist: s.artist }]);
    setQuery(""); setSugs([]);
  };

  useEffect(() => {
    if (!seeds.length && !vibe && !coords && !lang && !mood) { setResult(null); return; }
    setLoading(true);
    const p = new URLSearchParams();
    seeds.forEach((s) => p.append("seed", `${s.type}|${s.name}|${s.artist || ""}`));
    if (vibe) p.set("vibe", vibe);
    if (coords) { p.set("lat", coords.lat); p.set("lon", coords.lon); }
    if (lang) p.set("lang", lang);
    if (mood) p.set("mood", mood);
    p.set("size", "10");
    fetch(`${API}/discovery/recommend?${p}`).then((r) => r.json())
      .then((d) => { setResult(d); setLoading(false); }).catch(() => setLoading(false));
  }, [seeds, vibe, coords, lang, mood]);

  // Debounce the free-text "describe it" box into the vibe used for recs.
  useEffect(() => {
    const id = setTimeout(() => setVibe(vibeInput.trim()), 500);
    return () => clearTimeout(id);
  }, [vibeInput]);

  // A single song seed also gets harmonic "mixes well with" picks (key + BPM).
  useEffect(() => {
    const songSeed = seeds.length === 1 && seeds[0].type === "song" ? seeds[0] : null;
    if (!songSeed) { setMixes(null); return; }
    fetch(`${API}/discovery/mixes-with?track=${encodeURIComponent(songSeed.name)}&size=5`)
      .then((r) => r.json()).then((d) => setMixes(d.tracks || [])).catch(() => setMixes(null));
  }, [seeds]);

  const songRows = (list, owned) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
      {list.map((t, i) => (
        <TrackRow key={(owned ? t.id : t.spotify_id) || `${owned ? "o" : "u"}${i}`}
          track={owned ? t : { id: t.spotify_id || `u${i}`, name: t.name, artist: t.artist, spotify_url: t.spotify_url }}
          playing={playing} onPlay={play}
          note={owned ? (t.match != null ? `${Math.round(t.match * 100)}% match` : null) : "NEW"} />
      ))}
    </div>
  );

  return (
    <div>
      <Card style={{ marginBottom: 20, overflow: "visible", boxShadow: RAISED_SHADOW }}>
        <div style={{ ...TYPE.micro, marginBottom: 12 }}>Recommend from — add up to 2 songs or albums</div>
        {/* Active seed chips — lime fill with ink text, boxy */}
        {seeds.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {seeds.map((s, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: AW, border: `1.5px solid ${C.ink}`, borderRadius: 4, padding: "6px 12px", fontSize: 12, color: C.ink, fontFamily: FONT.ui, fontWeight: 500 }}>
                <span style={{ ...TYPE.micro, color: C.sub }}>{s.type}</span>
                {s.name}{s.artist ? <span style={{ color: C.sub }}>· {s.artist}</span> : null}
                <button onClick={() => setSeeds((prev) => prev.filter((_, x) => x !== i))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
        {seeds.length < 2 && (
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* Song/Album toggle — boxy editorial */}
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "transparent", border: `1.5px solid ${C.ink}`, borderRadius: 6 }}>
                <button onClick={() => setSeedType("song")} style={subTab(seedType === "song")}>Song</button>
                <button onClick={() => setSeedType("album")} style={subTab(seedType === "album")}>Album</button>
              </div>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search a ${seedType} in your library…`} style={{ flex: 1, minWidth: 180, color: C.ink }} />
            </div>
            {sugs.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 4, zIndex: 50, overflow: "hidden", boxShadow: MODAL_SHADOW }}>
                {sugs.map((s, i) => (
                  <button key={i} onClick={() => addSeed(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", borderTop: i ? `1px solid ${C.border}` : "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: FONT.ui }}>
                    {s.name} <span style={{ color: C.muted }}>· {s.artist}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Input value={vibeInput} onChange={(e) => setVibeInput(e.target.value)}
            placeholder="Describe it… e.g. rainy late-night bengali"
            style={{ width: "100%", maxWidth: 340, fontSize: 12, padding: "10px 14px", minHeight: 38, color: C.ink }} />
        </div>
        {/* Weather Station — prominent: tune recommendations to the live sky */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", marginTop: 16, background: PANEL, border: `1.5px solid ${coords ? AC : C.border2}`, borderRadius: 6, boxShadow: SHEEN, flexWrap: "wrap" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: AW, border: `1px solid ${AC}`, flexShrink: 0 }}>
            <WeatherIcon size={23} color={AC} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.4px", color: AC }}>Weather Station</div>
            <div style={{ fontFamily: FONT.display, fontSize: 16, fontWeight: 800, color: C.ink, marginTop: 3, letterSpacing: "-0.01em" }}>
              {coords ? "Tuning to your local sky" : "Match recommendations to the sky outside"}
            </div>
          </div>
          <button onClick={toggleWeather} style={btn(coords ? "ghost" : "primary", { whiteSpace: "nowrap" })}>
            {coords ? "Weather on ✓" : "Use weather →"}
          </button>
        </div>
        {/* Language + mood selects */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={input({ minWidth: 140, fontSize: 12, color: lang ? C.ink : C.muted })}>
            <option value="">Any language</option>
            {LANGUAGES.filter(Boolean).map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
          <select value={mood} onChange={(e) => setMood(e.target.value)} style={input({ minWidth: 140, fontSize: 12, color: mood ? C.ink : C.muted })}>
            <option value="">Any mood</option>
            {moodList.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        {/* Weather result inline — amber accent, ink text */}
        {result?.weather && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.sub, background: C.amberBg, border: `1px solid ${C.border2}`, borderRadius: 4, padding: "8px 12px", fontFamily: FONT.mono }}>
            <WeatherIcon size={16} color={C.amber} />
            Tuned to your sky — <span style={{ color: C.ink }}>{result.weather.explanation}</span>{result.weather.temperature != null ? ` · ${Math.round(result.weather.temperature)}°C` : ""}
          </div>
        )}
      </Card>

      {loading && <div style={{ ...TYPE.body }}>Finding matches…</div>}
      {!loading && !result && <EmptyState title="Add a seed or pick a vibe" hint="Drop in a song or album you love (or tap a vibe) — you'll get similar songs and albums, from your library and new to you." />}
      {!loading && result && (
        <>
          <Department no="—" title="Songs" />
          {result.songs?.owned?.length > 0 && (<>
            <div style={{ ...TYPE.micro, color: C.sub, margin: "6px 0 8px" }}>From your library</div>
            {songRows(result.songs.owned, true)}
          </>)}
          {result.songs?.unowned?.length > 0 && (<>
            <div style={{ ...TYPE.micro, color: C.muted, margin: "6px 0 8px" }}>New to you</div>
            {songRows(result.songs.unowned, false)}
          </>)}

          {(result.albums?.owned?.length > 0 || result.albums?.unowned?.length > 0) && (
            <div style={{ marginTop: 24 }}>
              <Department no="—" title="Albums" right={<span style={{ ...TYPE.micro, color: C.muted }}>★ yours · the rest new</span>} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
                {(result.albums.owned || []).map((a, i) => <AlbumRecCard key={`o${i}`} a={{ ...a, already_saved: true }} />)}
                {(result.albums.unowned || []).map((a, i) => <AlbumRecCard key={`u${i}`} a={{ ...a, already_saved: false }} />)}
              </div>
            </div>
          )}

          {mixes && mixes.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Department no="—" title="Mixes well with" right={<span style={{ ...TYPE.micro, color: C.muted }}>harmonic key · close BPM</span>} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {mixes.map((t) => (
                  <TrackRow key={t.id} track={t} playing={playing} onPlay={play} note={t.relation} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FindView() {
  const [sub, setSub] = useState("recommend");
  return (
    <div>
      {/* Editorial sub-tab toggle — boxy, ink-bordered */}
      <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "transparent", border: `1.5px solid ${C.ink}`, borderRadius: 6, marginBottom: 24 }}>
        <button onClick={() => setSub("recommend")} style={subTab(sub === "recommend")}>Recommend</button>
        <button onClick={() => setSub("album")} style={subTab(sub === "album")}>Album Lens</button>
      </div>
      {sub === "recommend" ? <RecommendStudio /> : <AlbumsView />}
    </div>
  );
}

/* ─────────────────────────── FRONTIER (blind spots + rabbit holes) ─────────────────────────── */
function FrontierView() {
  const [sub, setSub] = useState("blindspots");
  return (
    <div>
      {/* Editorial sub-tab toggle */}
      <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "transparent", border: `1.5px solid ${C.ink}`, borderRadius: 6, marginBottom: 24 }}>
        <button onClick={() => setSub("blindspots")} style={subTab(sub === "blindspots")}>Blind Spots</button>
        <button onClick={() => setSub("rabbit")} style={subTab(sub === "rabbit")}>Rabbit Holes</button>
      </div>
      {sub === "blindspots" ? <BlindSpotsView /> : <DeeperView />}
    </div>
  );
}

/* ─────────────────────────── SHELL ─────────────────────────── */
export default function Discover() {
  const [mode, setMode] = useState("find");

  // Metallic amber tab — active = amber fill + dark ink text; inactive = transparent outline.
  const heroTab = (active) => ({
    padding: "8px 15px", borderRadius: 4, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer",
    background: active ? AC : "transparent",
    color: active ? C.ink2 : C.ink,
    border: active ? `1px solid ${AC}` : `1px solid ${C.border2}`,
    transition: "all 0.15s",
  });

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>
      <Masthead
        no="03"
        section="Discover"
        title="Discover"
        lede={<>Search your library, or find new music to expand your taste</>}
        actions={<>
          <button style={heroTab(mode === "find")} onClick={() => setMode("find")}>Find</button>
          <button style={heroTab(mode === "frontier")} onClick={() => setMode("frontier")}>Frontier</button>
        </>}
      />

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "36px 24px 64px" }}>
        {mode === "find" && <FindView />}
        {mode === "frontier" && <FrontierView />}
      </div>
    </div>
  );
}
