import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import { C, TYPE, FONT, MOOD, input } from "../theme";
import { useRef } from "react";
import { PageHeader, Card, Pill, Department, Expander, Input, Button, TrackRow, EmptyState, Modal, Reveal, FlipCard } from "../ui";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIMIT = 50;

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
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        <Pill active={mode === "nlp"} onClick={() => { setMode("nlp"); setResults(null); }}>✨ Describe It</Pill>
        <Pill active={mode === "filters"} onClick={() => { setMode("filters"); setResults(null); }}>🎚️ Use Filters</Pill>
        <Pill active={!!weatherData} onClick={weatherSearch} style={{ marginLeft: "auto", borderColor: weatherData ? C.amber : C.border, background: weatherData ? C.amber : "#151515", color: weatherData ? "#000" : C.sub }}>
          {weatherLoading ? "Getting weather…" : "🌤️ Match My Weather"}
        </Pill>
      </div>

      {mode === "nlp" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <Input value={nlpQuery} onChange={(e) => setNlpQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nlpSearch()} autoFocus placeholder='Try: "sad slow songs" or "chill acoustic 90s"' style={{ flex: 1, minWidth: 220, padding: "13px 18px", fontSize: 15 }} />
            <Button onClick={nlpSearch} style={{ padding: "13px 26px", fontSize: 15 }}>Search</Button>
          </div>
          {interpreted && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 8, padding: "6px 14px", fontSize: 13 }}>
              <span style={{ color: C.green }}>✓ Interpreted as:</span><span style={{ color: "#aaa" }}>{interpreted}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {NLP_SUGGEST.map((s) => <Pill key={s} active={false} onClick={() => setNlpQuery(s)} style={{ minHeight: 32, padding: "5px 12px", fontSize: 12, background: "transparent" }}>{s}</Pill>)}
          </div>
        </div>
      )}

      {mode === "filters" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {QUICK_VIBES.map((v) => (
              <Pill key={v.label} active={activeVibe === v.label} onClick={() => { resetFilters(); setActiveVibe(v.label); filterSearch(v.params); }} style={{ minHeight: 32, padding: "6px 13px", fontSize: 12 }}>{v.label}</Pill>
            ))}
          </div>
          <Card style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
            <div><div style={{ ...TYPE.micro, marginBottom: 6 }}>Text search</div><Input value={textQ} onChange={(e) => setTextQ(e.target.value)} placeholder="Song, album…" style={{ width: "100%" }} /></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 6 }}>Artist</div><Input value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)} placeholder="Artist name…" style={{ width: "100%" }} /></div>
            <RangeRow label="BPM range" a={minTempo} setA={setMinTempo} b={maxTempo} setB={setMaxTempo} />
            <RangeRow label="Energy (0–1)" a={minEnergy} setA={setMinEnergy} b={maxEnergy} setB={setMaxEnergy} step="0.1" />
            <RangeRow label="Mood (0–1)" a={minValence} setA={setMinValence} b={maxValence} setB={setMaxValence} step="0.1" />
            <RangeRow label="Release year" a={minYear} setA={setMinYear} b={maxYear} setB={setMaxYear} />
            <div>
              <div style={{ ...TYPE.micro, marginBottom: 6 }}>Language</div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={input({ width: "100%", cursor: "pointer", color: language ? "#fff" : C.muted })}>
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

      {weatherData && (
        <div style={{ background: C.amberBg, border: "1px solid #3a3000", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🌤️</span><span style={{ color: C.amber }}>{weatherData.temperature}°C · {weatherData.explanation}</span>
        </div>
      )}

      {loading && <div style={{ ...TYPE.body, padding: "30px 0" }}>Searching your library…</div>}

      {results && !loading && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div style={{ ...TYPE.micro, color: C.faint }}>{results.length} songs{total > results.length ? ` of ${total.toLocaleString()} matches` : ""}</div>
            {results.length > 0 && (saveResult?.success ? (
              <a href={saveResult.playlist_url} target="_blank" rel="noreferrer" style={{ padding: "8px 18px", borderRadius: 10, background: C.green, color: "#000", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>✓ Open in Spotify ↗</a>
            ) : (
              <Button onClick={() => { setShowSave(true); setSaveResult(null); setSaveName(interpreted ? `Fidolio: ${interpreted}` : "Fidolio Search"); }} style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBd}` }}>+ Save as Playlist</Button>
            ))}
          </div>
          {results.length === 0 ? <EmptyState title="No songs found" hint="Try a different description or fewer filters." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{results.map((t) => <TrackRow key={t.id} track={t} playing={playing} onPlay={play} />)}</div>
          )}
        </>
      )}

      {!results && !loading && <EmptyState icon="🔍" title="Describe what you want to hear" hint="Natural language, filters, or your local weather." />}

      <Modal open={showSave} onClose={() => setShowSave(false)}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Save as Spotify Playlist</div>
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
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, background: fromLibrary ? C.greenBg : C.card, border: `1px solid ${fromLibrary ? C.greenBd : C.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: fromLibrary ? C.green : "#1a1a1a", color: fromLibrary ? "#000" : C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{fromLibrary ? "✓" : "♪"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          {track.name}
          {track.already_saved && !fromLibrary && <span style={{ fontSize: 10, color: C.green, background: C.greenBg, padding: "2px 6px", borderRadius: 4 }}>SAVED</span>}
        </div>
        <div style={{ fontSize: 12, color: fromLibrary ? "#4a9a5a" : C.sub, marginTop: 2 }}>{track.artist}</div>
      </div>
      <a href={track.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.green, textDecoration: "none", padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.greenBd}` }}>Open ↗</a>
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
      <div style={{ ...TYPE.micro, marginBottom: 10 }}>Quick vibe</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {FORYOU_VIBES.map((v) => <Pill key={v.label} active={activeVibe === v.label} onClick={() => { setActiveVibe(v.label); setVibe(v.value); }}>{v.emoji} {v.label}</Pill>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
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
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Mood</div><div style={{ display: "flex", gap: 6 }}>{["any", "happy", "dark"].map((m) => <Pill key={m} active={mood === m} onClick={() => setMood(m)} style={{ flex: 1, justifyContent: "center", textTransform: "capitalize", minHeight: 38 }}>{m}</Pill>)}</div></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Min BPM</div><Input type="number" value={minTempo} onChange={(e) => setMinTempo(e.target.value)} placeholder="90" style={{ width: "100%" }} /></div>
            <div><div style={{ ...TYPE.micro, marginBottom: 8 }}>Max BPM</div><Input type="number" value={maxTempo} onChange={(e) => setMaxTempo(e.target.value)} placeholder="130" style={{ width: "100%" }} /></div>
          </div>
        </Expander>
      </div>

      <Button onClick={discover} disabled={loading} style={{ width: "100%", padding: 16, fontSize: 16, marginBottom: 32 }}>{loading ? "Building your playlist…" : "Generate Playlist →"}</Button>

      {ctx && !loading && (
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", padding: "4px 2px", marginBottom: 28, ...TYPE.body, fontSize: 12 }}>
          {[["Time", `${ctx.time_of_day} (${ctx.hour}:00)`], ["Energy", `${Math.round(ctx.target_features.energy * 100)}%`], ["Mood", `${Math.round(ctx.target_features.valence * 100)}%`], ["BPM", `${Math.round(ctx.target_features.tempo)}`], ["Hour data", ctx.used_hour_data ? "✓" : "—"], ["Recent data", ctx.used_recent_data ? "✓" : "—"]].map(([l, v]) => (
            <span key={l}>{l} <b style={{ color: "#fff" }}>{v}</b></span>
          ))}
        </div>
      )}

      {data?.library_matches?.length > 0 && !loading && (
        <div style={{ marginBottom: 28 }}>
          <Department no="—" title="From Your Library" right={<span style={{ ...TYPE.micro, color: C.green }}>songs you already love</span>} />
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
    <div style={{ height: 4, width: 70, background: C.border, borderRadius: 2, flexShrink: 0 }}>
      <div style={{ height: 4, borderRadius: 2, background: p > 65 ? C.green : p > 40 ? C.amber : C.indigo, width: `${p}%`, transition: "width 0.4s" }} />
    </div>
  );
}
function AlbumsView() {
  const [albumName, setAlbumName] = useState(""); const [artistName, setArtistName] = useState("");
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  const [trackSort, setTrackSort] = useState("order"); // "order" | "match"
  const [onlyNew, setOnlyNew] = useState(false);
  const tab = "explorer";

  const exploreAlbum = async (al = albumName, ar = artistName) => {
    if (!al || !ar) return;
    setAlbumName(al); setArtistName(ar);
    setLoading(true); setData(null);
    try { const res = await fetch(`${API}/albums/explore?album_name=${encodeURIComponent(al)}&artist_name=${encodeURIComponent(ar)}`); setData(await res.json()); }
    catch { setData({ found: false, message: "Request failed — try again" }); }
    setLoading(false);
  };
  const SUGGESTIONS = [
    { al: "Swimming", ar: "Mac Miller" }, { al: "Blonde", ar: "Frank Ocean" },
    { al: "DAMN.", ar: "Kendrick Lamar" }, { al: "Currents", ar: "Tame Impala" },
  ];
  const fitLabel = (s) => s >= 0.7 ? { text: "Strong match for your taste", color: C.green } : s >= 0.5 ? { text: "Decent fit for your taste", color: C.amber } : { text: "Outside your usual taste", color: C.indigo };

  let albumTracks = data?.tracks ? [...data.tracks] : [];
  if (onlyNew) albumTracks = albumTracks.filter((t) => !t.already_saved);
  if (trackSort === "match") albumTracks.sort((a, b) => (b.taste_score || 0) - (a.taste_score || 0));

  return (
    <Reveal>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...TYPE.micro, marginRight: 4 }}>Try an album</span>
        {SUGGESTIONS.map((s) => <Pill key={s.al} active={false} onClick={() => exploreAlbum(s.al, s.ar)} style={{ minHeight: 30, padding: "4px 11px", fontSize: 11 }}>{s.al}</Pill>)}
      </div>

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
              <Card style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h2 style={{ ...TYPE.section, fontSize: 24 }}>{data.album.name}</h2>
                    <p style={{ color: C.sub, marginTop: 4 }}>{data.album.artist}</p>
                    {data.album.tags?.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{data.album.tags.map((t) => <span key={t} style={{ fontSize: 11, color: C.sub, background: C.border, padding: "3px 10px", borderRadius: 12 }}>{t}</span>)}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ ...TYPE.stat, fontSize: 30, color: fitLabel(data.taste_comparison.overall_fit).color }}>{Math.round(data.taste_comparison.overall_fit * 100)}%</div>
                    <div style={{ ...TYPE.micro, marginTop: 4 }}>taste match</div>
                    <div style={{ fontSize: 12, color: fitLabel(data.taste_comparison.overall_fit).color, marginTop: 4 }}>{fitLabel(data.taste_comparison.overall_fit).text}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 20 }}>
                  {[{ label: "Energy", yours: data.taste_comparison.your_energy, album: data.taste_comparison.album_energy }, { label: "Mood", yours: data.taste_comparison.your_valence, album: data.taste_comparison.album_valence }].map((row) => (
                    <div key={row.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.micro, marginBottom: 6 }}><span>{row.label}</span><span>You {Math.round((row.yours || 0) * 100)}% · Album {Math.round((row.album || 0) * 100)}%</span></div>
                      <div style={{ height: 4, background: C.border, borderRadius: 2, position: "relative" }}>
                        <div style={{ position: "absolute", height: 4, background: C.faint, borderRadius: 2, width: `${(row.album || 0) * 100}%` }} />
                        <div style={{ position: "absolute", height: 4, background: C.green, borderRadius: 2, width: 2, left: `${(row.yours || 0) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 16, ...TYPE.body, fontSize: 12 }}><span>{data.album.track_count} tracks</span><span>{data.album.you_own} already in your library</span></div>
              </Card>

              {data.entry_points?.length > 0 && (
                <Card tint={C.greenBg} style={{ border: `1px solid ${C.greenBd}`, marginBottom: 20 }}>
                  <div style={{ ...TYPE.micro, color: C.green, marginBottom: 16 }}>Start here — best entry points for your taste</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.entry_points.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.green, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div><div style={{ fontSize: 11, color: "#4a9a5a", marginTop: 2 }}>{Math.round(t.taste_score * 100)}% match</div></div>
                        {t.spotify_url && <a href={t.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.green, textDecoration: "none", padding: "4px 10px", border: `1px solid ${C.greenBd}`, borderRadius: 6 }}>Open ↗</a>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                  <div style={{ ...TYPE.micro }}>Full track list</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Pill active={trackSort === "order"} onClick={() => setTrackSort("order")} style={{ minHeight: 30, padding: "4px 11px", fontSize: 11 }}>Album order</Pill>
                    <Pill active={trackSort === "match"} onClick={() => setTrackSort("match")} style={{ minHeight: 30, padding: "4px 11px", fontSize: 11 }}>Best match</Pill>
                    <Pill active={onlyNew} onClick={() => setOnlyNew((v) => !v)} style={{ minHeight: 30, padding: "4px 11px", fontSize: 11 }}>New to me</Pill>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {albumTracks.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px" }}>
                      <span style={{ color: C.faint, fontSize: 12, width: 20, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: t.recommended_entry ? 600 : 400, display: "flex", alignItems: "center", gap: 6 }}>
                          {t.name}
                          {t.already_saved && <span style={{ fontSize: 10, color: C.green, background: C.greenBg, padding: "1px 5px", borderRadius: 3 }}>SAVED</span>}
                          {t.recommended_entry && !t.already_saved && <span style={{ fontSize: 10, color: C.amber, background: C.amberBg, padding: "1px 5px", borderRadius: 3 }}>REC</span>}
                        </div>
                      </div>
                      <ScoreBar score={t.taste_score} />
                      {t.spotify_url && <a href={t.spotify_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.muted, textDecoration: "none", flexShrink: 0 }}>↗</a>}
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
const chip = { fontSize: 11, color: "#fff", background: "#151515", border: `1px solid ${C.border}`, padding: "3px 9px", borderRadius: 10, whiteSpace: "nowrap" };
const faceHint = { marginTop: "auto", ...TYPE.micro, color: C.muted, paddingTop: 10, textAlign: "right" };

function BlindFront({ spot, meaning, meaningOpen, onInfo }) {
  return (
    <div style={{ height: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 800, textTransform: "capitalize", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>{spot.genre}</div>
          <button onClick={(e) => { e.stopPropagation(); onInfo(); }} aria-label="What does this mean?"
            style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.border2}`, background: meaningOpen ? C.green : "transparent", color: meaningOpen ? "#000" : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>i</button>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: C.indigo }}>{spot.songs_in_library}</div>
          <div style={{ ...TYPE.micro, color: C.faint }}>songs</div>
        </div>
      </div>
      {meaningOpen && (
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: 8, background: "#151515", borderRadius: 8, padding: "8px 10px" }}>
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
              <div key={i} style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ color: "#fff" }}>{s.name}</span> · {s.artist}</div>
            ))}
          </div>
        </>
      )}
      <div style={faceHint}>tap to flip ⤿</div>
    </div>
  );
}

function BlindBack({ spot, det }) {
  const loading = !det || det.loading;
  return (
    <div style={{ height: "100%", background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ ...TYPE.micro, color: C.green, marginBottom: 4 }}>Go deeper into {spot.genre}</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 14 }}>Niche artists you'd likely love — you don't own these yet:</div>
      {loading ? <div style={{ ...TYPE.body, fontSize: 12 }}>Finding artists…</div> :
        det.recommended_artists?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {det.recommended_artists.map((a, i) => (
              <a key={a} href={`https://open.spotify.com/search/${encodeURIComponent(a)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: C.green, width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</span>
                <span style={{ fontSize: 11, color: C.green }}>↗</span>
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
                back={<BlindBack spot={spot} det={det} />}
              />
            );
          })}
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────────────────── DEEPER (rabbit holes) ─────────────────────────── */
function DeeperFront({ h, rank, maxSaved }) {
  const days = Math.max(0, Math.round((new Date(h.last_save) - new Date(h.first_save)) / 86400000));
  return (
    <div style={{ height: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYPE.micro, color: C.faint }}>Nº {String(rank).padStart(2, "0")}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 800, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.artist}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: 700, color: C.green }}>{h.songs_saved}</div>
          <div style={{ ...TYPE.micro, color: C.faint }}>saved</div>
        </div>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 14 }}>
        <div style={{ height: 4, borderRadius: 2, background: C.green, width: `${(h.songs_saved / maxSaved) * 100}%` }} />
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginTop: 14, lineHeight: 1.5 }}>
        {days === 0 ? `You saved ${h.songs_saved} of their songs in one sitting on ${h.first_save}.` : `You binged ${h.songs_saved} of their songs over ${days} day${days === 1 ? "" : "s"} — ${h.first_save} → ${h.last_save}.`}
      </div>
      <div style={faceHint}>tap for what's next ⤿</div>
    </div>
  );
}

function DeeperBack({ h, data }) {
  const loading = !data || data.loading;
  return (
    <div style={{ height: "100%", background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ ...TYPE.micro, color: C.green, marginBottom: 10 }}>Continue down the {h.artist} hole</div>
      {loading ? <div style={{ ...TYPE.body, fontSize: 12 }}>Finding their best tracks…</div> :
        data.tracks?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.tracks.map((t, i) => (
              <a key={i} href={`https://open.spotify.com/search/${encodeURIComponent(h.artist + " " + t.name)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <span style={{ fontFamily: FONT.display, fontSize: 12, fontWeight: 700, color: C.green, width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                {t.owned ? <span style={{ fontSize: 9, color: C.green, border: `1px solid ${C.greenBd}`, padding: "1px 5px", borderRadius: 4 }}>OWNED</span> : <span style={{ fontSize: 11, color: C.green }}>↗</span>}
              </a>
            ))}
          </div>
        ) : <div style={{ ...TYPE.body, fontSize: 12 }}>Couldn't find their top tracks.</div>}
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

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then((d) => setHoles(d.rabbit_holes || [])).catch(() => setHoles([]));
  }, []);

  const all = holes || [];
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const shown = all.slice(page * pageSize, page * pageSize + pageSize);
  const maxSaved = all.length ? Math.max(...all.map((h) => h.songs_saved)) : 1;

  const loadTracks = (artist) => {
    if (requested.current.has(artist)) return;
    requested.current.add(artist);
    setTracks((t) => ({ ...t, [artist]: { loading: true } }));
    fetch(`${API}/albums/artist-top-tracks?artist=${encodeURIComponent(artist)}`).then((r) => r.json())
      .then((d) => setTracks((t) => ({ ...t, [artist]: d }))).catch(() => setTracks((t) => ({ ...t, [artist]: { tracks: [] } })));
  };
  useEffect(() => { shown.forEach((h) => loadTracks(h.artist)); /* eslint-disable-next-line */ }, [page, holes]);

  return (
    <Reveal>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <p style={{ ...TYPE.body, maxWidth: 520, margin: 0 }}>Artists you binged hardest. Tap to flip and see which of their tracks to play next.</p>
        {pages > 1 && <Button variant="ghost" onClick={() => { setPage((p) => (p + 1) % pages); setFlipped({}); }}>↻ 5 different ones</Button>}
      </div>
      {!holes && <div style={{ ...TYPE.body }}>Loading…</div>}
      {holes && all.length === 0 && <EmptyState title="No rabbit holes yet" hint="Save a bunch of one artist in a short window and they'll show up." />}
      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {shown.map((h, idx) => (
            <FlipCard key={h.artist} height={260} flipped={!!flipped[h.artist]}
              onFlip={() => { loadTracks(h.artist); setFlipped((f) => ({ ...f, [h.artist]: !f[h.artist] })); }}
              front={<DeeperFront h={h} rank={page * pageSize + idx + 1} maxSaved={maxSaved} />}
              back={<DeeperBack h={h} data={tracks[h.artist]} />}
            />
          ))}
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────────────────── SHELL ─────────────────────────── */
export default function Discover() {
  const [mode, setMode] = useState("search");
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: MOOD.dark.tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 36px" }}>
          <PageHeader
            kicker="Nº 03 · Discover"
            title="Discover"
            accent={C.indigo}
            lede="Search your library, get recommendations tuned to your taste, and vet any album before you commit."
            actions={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill active={mode === "search"} onClick={() => setMode("search")}>Search</Pill>
                <Pill active={mode === "albums"} onClick={() => setMode("albums")}>Albums</Pill>
                <Pill active={mode === "blindspots"} onClick={() => setMode("blindspots")}>Blind Spots</Pill>
                <Pill active={mode === "deeper"} onClick={() => setMode("deeper")}>Deeper</Pill>
              </div>
            }
          />
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "36px 24px 64px" }}>
        {mode === "search" && <SearchView />}
        {mode === "albums" && <AlbumsView />}
        {mode === "blindspots" && <BlindSpotsView />}
        {mode === "deeper" && <DeeperView />}
      </div>
    </div>
  );
}
