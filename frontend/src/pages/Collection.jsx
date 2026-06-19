import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import { C, TYPE, FONT, MOOD, input } from "../theme";
import { PageHeader, Card, Pill, Department, Expander, Input, Button, TrackRow, EmptyState, Reveal } from "../ui";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIMIT = 50;

const SORT_OPTIONS = [
  { value: "saved_at", label: "Date Saved" },
  { value: "energy", label: "Energy" },
  { value: "valence", label: "Mood" },
  { value: "tempo", label: "BPM" },
  { value: "artist", label: "Artist" },
  { value: "name", label: "Title" },
  { value: "release_year", label: "Year" },
];

// Multi-select decades (each = a 10-year bucket starting at `start`).
const DECADES = [
  { label: "2020s", start: 2020 },
  { label: "2010s", start: 2010 },
  { label: "2000s", start: 2000 },
  { label: "90s", start: 1990 },
  { label: "80s", start: 1980 },
  { label: "70s", start: 1970 },
  { label: "60s", start: 1960 },
  { label: "50s", start: 1950 },
];

const LANGUAGES = ["", "english", "hindi", "bengali", "arabic", "spanish", "french", "portuguese", "japanese", "chinese", "punjabi", "tamil", "urdu"];

export default function Collection() {
  const [mode, setMode] = useState("browse");

  // Browser state
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState("saved_at");
  const [order, setOrder] = useState("desc");
  const [decades, setDecades] = useState([]); // [] = all decades
  const [moods, setMoods] = useState([]);     // niche moods (multi-select)
  const [moodList, setMoodList] = useState([]);
  const [language, setLanguage] = useState("");
  const [minEnergy, setMinEnergy] = useState("");
  const [maxEnergy, setMaxEnergy] = useState("");
  const [minTempo, setMinTempo] = useState("");
  const [maxTempo, setMaxTempo] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [artist, setArtist] = useState("");
  const { playing, play } = usePreview();

  // Health state
  const [duplicates, setDuplicates] = useState(null);
  const [deadSaves, setDeadSaves] = useState(null);
  const [topArtists, setTopArtists] = useState(null);
  const [healthTab, setHealthTab] = useState("duplicates");
  const [deadShown, setDeadShown] = useState(60);

  const toggleDecade = (start) =>
    setDecades((prev) => (prev.includes(start) ? prev.filter((x) => x !== start) : [...prev, start]));
  const toggleMood = (key) =>
    setMoods((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  const buildParams = (off = 0) => {
    const p = new URLSearchParams();
    p.set("sort_by", sortBy);
    p.set("order", order);
    p.set("limit", LIMIT);
    p.set("offset", off);
    if (decades.length) p.set("decades", decades.join(","));
    if (language) p.set("language", language);
    if (minEnergy) p.set("min_energy", minEnergy);
    if (maxEnergy) p.set("max_energy", maxEnergy);
    if (minTempo) p.set("min_tempo", minTempo);
    if (maxTempo) p.set("max_tempo", maxTempo);
    if (moods.length) p.set("moods", moods.join(","));
    if (artist) p.set("artist", artist);
    return p;
  };

  const load = async (off = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/library/liked-songs?${buildParams(off)}`);
      const data = await res.json();
      setTracks((prev) => (off === 0 ? data.tracks || [] : [...prev, ...(data.tracks || [])]));
      setTotal(data.total || 0);
      setOffset(off + LIMIT);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(0); }, [sortBy, order, decades.join(","), language, moods.join(","), minEnergy, maxEnergy, minTempo, maxTempo, artist]);

  useEffect(() => {
    fetch(`${API}/library/moods`).then((r) => r.json()).then((d) => setMoodList(d.moods || []));
    fetch(`${API}/library/duplicates`).then((r) => r.json()).then(setDuplicates);
    fetch(`${API}/library/dead-saves`).then((r) => r.json()).then(setDeadSaves);
    fetch(`${API}/library/top-saved-artists?limit=20`).then((r) => r.json()).then(setTopArtists);
  }, []);

  const activeFilterCount =
    decades.length + (language ? 1 : 0) +
    (minEnergy ? 1 : 0) + (maxEnergy ? 1 : 0) + (minTempo ? 1 : 0) + (maxTempo ? 1 : 0) + (artist ? 1 : 0);

  const healthTabs = [
    { id: "duplicates", label: `Duplicates${duplicates ? ` (${duplicates.duplicates.length})` : ""}` },
    { id: "dead", label: `Dead Saves${deadSaves ? ` (${(deadSaves.total ?? deadSaves.dead_saves?.length) || 0})` : ""}` },
    { id: "artists", label: "Top Artists" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: MOOD.happy.tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 36px" }}>
          <PageHeader
            kicker="Nº 02 · Collection"
            title="The Collection"
            lede={<>{total ? total.toLocaleString() : "…"} songs — sorted, filtered, and actually findable.</>}
            actions={
              <div style={{ display: "flex", gap: 8 }}>
                <Pill active={mode === "browse"} onClick={() => setMode("browse")}>Browse</Pill>
                <Pill active={mode === "health"} onClick={() => setMode("health")}>Library Health</Pill>
              </div>
            }
          />
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "36px 24px 64px" }}>
        {mode === "browse" ? (
          <Reveal>
            {/* Moods — standalone, multi-select (a song can be several) */}
            <Card style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ ...TYPE.micro }}>Moods — combine any · a song can match several</div>
                {moods.length > 0 && <button onClick={() => setMoods([])} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>clear</button>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {moodList.length === 0 && <span style={{ ...TYPE.body, fontSize: 12 }}>Reading the room…</span>}
                {moodList.map((m) => (
                  <Pill key={m.key} active={moods.includes(m.key)} onClick={() => toggleMood(m.key)} style={{ minHeight: 34 }}>
                    {m.label} <span style={{ opacity: 0.55, marginLeft: 4 }}>{(m.count || 0).toLocaleString()}</span>
                  </Pill>
                ))}
              </div>
            </Card>

            {/* Sort */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {SORT_OPTIONS.map((s) => (
                <Pill
                  key={s.value}
                  active={sortBy === s.value}
                  onClick={() => { if (sortBy === s.value) setOrder((o) => (o === "desc" ? "asc" : "desc")); else { setSortBy(s.value); setOrder("desc"); } }}
                  style={{ minHeight: 34, padding: "6px 13px" }}
                >
                  {s.label} {sortBy === s.value ? (order === "desc" ? "↓" : "↑") : ""}
                </Pill>
              ))}
            </div>

            {/* Decades — multi-select */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <span style={{ ...TYPE.micro, marginRight: 4 }}>Decades — pick any</span>
              <Pill active={decades.length === 0} onClick={() => setDecades([])} style={{ minHeight: 32, padding: "5px 12px", fontSize: 11 }}>All</Pill>
              {DECADES.map((d) => (
                <Pill key={d.start} active={decades.includes(d.start)} onClick={() => toggleDecade(d.start)} style={{ minHeight: 32, padding: "5px 12px", fontSize: 11 }}>
                  {d.label}
                </Pill>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <Expander label="More filters" sublabel={activeFilterCount ? `${activeFilterCount} active` : "language · energy · BPM · artist"}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, paddingTop: 6 }}>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Language</div>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} style={input({ width: "100%", cursor: "pointer", color: language ? "#fff" : C.muted })}>
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l === "" ? "Any language" : l[0].toUpperCase() + l.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Energy range (0–1)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input type="number" step="0.1" value={minEnergy} onChange={(e) => setMinEnergy(e.target.value)} placeholder="Min" style={{ width: "50%" }} />
                      <Input type="number" step="0.1" value={maxEnergy} onChange={(e) => setMaxEnergy(e.target.value)} placeholder="Max" style={{ width: "50%" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>BPM range</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input type="number" value={minTempo} onChange={(e) => setMinTempo(e.target.value)} placeholder="Min" style={{ width: "50%" }} />
                      <Input type="number" value={maxTempo} onChange={(e) => setMaxTempo(e.target.value)} placeholder="Max" style={{ width: "50%" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Artist</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input value={artistInput} onChange={(e) => setArtistInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setArtist(artistInput)} placeholder="Filter artist…" style={{ flex: 1 }} />
                      <Button onClick={() => setArtist(artistInput)} style={{ padding: "9px 14px" }}>Go</Button>
                      {artist && <Button variant="ghost" onClick={() => { setArtist(""); setArtistInput(""); }} style={{ padding: "9px 12px" }}>✕</Button>}
                    </div>
                  </div>
                </div>
              </Expander>
            </div>

            <div style={{ ...TYPE.micro, color: C.faint, marginBottom: 12 }}>
              {loading && tracks.length === 0 ? "Loading…" : `${tracks.length} of ${total.toLocaleString()} songs`}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {tracks.map((t) => <TrackRow key={t.id} track={t} playing={playing} onPlay={play} />)}
            </div>

            {tracks.length < total && (
              <Button variant="ghost" onClick={() => load(offset)} disabled={loading} style={{ width: "100%", marginTop: 16, padding: "14px" }}>
                {loading ? "Loading…" : `Load more (${(total - tracks.length).toLocaleString()} remaining)`}
              </Button>
            )}
          </Reveal>
        ) : (
          <Reveal>
            <Department no="—" title="Library Health" right={<span style={{ ...TYPE.micro, color: C.muted }}>Fix what Spotify won't</span>} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
              {healthTabs.map((t) => (
                <Pill key={t.id} active={healthTab === t.id} onClick={() => setHealthTab(t.id)}>{t.label}</Pill>
              ))}
            </div>

            {healthTab === "duplicates" && (
              !duplicates ? <div style={TYPE.body}>Scanning…</div> :
              duplicates.duplicates.length === 0 ? <EmptyState icon="✓" title="No duplicates found" hint="Your library is clean." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {duplicates.duplicates.map((d, i) => (
                    <Card key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{d.name}</div>
                        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{d.artist}</div>
                        <div style={{ ...TYPE.micro, color: C.faint, marginTop: 6, letterSpacing: "0.5px" }}>
                          Saved {d.saved_dates?.map((x) => x.slice(0, 10)).join(", ")}
                        </div>
                      </div>
                      <div style={{ background: C.redBg, color: C.red, border: "1px solid #3a1a1a", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {d.copies}×
                      </div>
                    </Card>
                  ))}
                </div>
              )
            )}

            {healthTab === "dead" && (
              !deadSaves ? <div style={TYPE.body}>Scanning…</div> : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                    <span style={{ ...TYPE.stat, fontSize: 40, color: C.amber }}>{(deadSaves.total ?? deadSaves.dead_saves.length).toLocaleString()}</span>
                    <span style={{ ...TYPE.micro }}>forgotten saves</span>
                  </div>
                  <p style={{ ...TYPE.body, marginBottom: 18 }}>Saved over a year ago and never played since — or never played at all.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {deadSaves.dead_saves.slice(0, deadShown).map((s, i) => (
                      <Card key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                          <div style={{ fontSize: 13, color: C.sub }}>{s.artist}</div>
                        </div>
                        <div style={{ display: "flex", gap: 18, fontSize: 11, flexShrink: 0, textAlign: "right" }}>
                          <div>
                            <div style={{ ...TYPE.micro, color: C.faint }}>Saved</div>
                            <div style={{ color: C.sub }}>{s.saved_at || "—"}</div>
                          </div>
                          <div>
                            <div style={{ ...TYPE.micro, color: C.faint }}>Last played</div>
                            <div style={{ color: s.last_played ? C.sub : C.red }}>{s.last_played || "Never"}</div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  {deadSaves.dead_saves.length > deadShown && (
                    <Button variant="ghost" onClick={() => setDeadShown((n) => n + 100)} style={{ width: "100%", marginTop: 14, padding: "12px" }}>
                      Show more ({(deadSaves.dead_saves.length - deadShown).toLocaleString()} more loaded)
                    </Button>
                  )}
                </>
              )
            )}

            {healthTab === "artists" && (
              !topArtists ? <div style={TYPE.body}>Loading…</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  {topArtists.artists.map((a, i) => (
                    <Card key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: C.faint, minWidth: 30, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{a.artist}</div>
                        <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 8 }}>
                          <div style={{ height: 3, borderRadius: 2, background: C.green, width: `${(a.songs / (topArtists.artists[0]?.songs || 1)) * 100}%` }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700, color: C.green }}>{a.songs}</div>
                        <div style={{ ...TYPE.micro, color: C.faint }}>songs</div>
                      </div>
                    </Card>
                  ))}
                </div>
              )
            )}
          </Reveal>
        )}
      </div>
    </div>
  );
}
