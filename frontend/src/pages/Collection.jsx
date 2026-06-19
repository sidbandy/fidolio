import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import { C, TYPE, FONT, MOOD } from "../theme";
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

const DECADES = [
  { label: "All", min: null, max: null },
  { label: "2020s", min: 2020, max: 2029 },
  { label: "2010s", min: 2010, max: 2019 },
  { label: "2000s", min: 2000, max: 2009 },
  { label: "90s", min: 1990, max: 1999 },
  { label: "80s", min: 1980, max: 1989 },
  { label: "70s", min: 1970, max: 1979 },
  { label: "Older", min: 1900, max: 1969 },
];

export default function Collection() {
  const [mode, setMode] = useState("browse");

  // Browser state
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState("saved_at");
  const [order, setOrder] = useState("desc");
  const [decade, setDecade] = useState(DECADES[0]);
  const [mood, setMood] = useState("any");
  const [minEnergy, setMinEnergy] = useState("");
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

  const buildParams = (off = 0) => {
    const p = new URLSearchParams();
    p.set("sort_by", sortBy);
    p.set("order", order);
    p.set("limit", LIMIT);
    p.set("offset", off);
    if (decade.min) { p.set("min_year", decade.min); p.set("max_year", decade.max); }
    if (minEnergy) p.set("min_energy", minEnergy);
    if (minTempo) p.set("min_tempo", minTempo);
    if (maxTempo) p.set("max_tempo", maxTempo);
    if (mood === "happy") p.set("min_valence", "0.6");
    if (mood === "dark") p.set("max_valence", "0.35");
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

  useEffect(() => { load(0); /* eslint-disable-next-line */ }, [sortBy, order, decade, mood, minEnergy, minTempo, maxTempo, artist]);

  useEffect(() => {
    fetch(`${API}/library/duplicates`).then((r) => r.json()).then(setDuplicates);
    fetch(`${API}/library/dead-saves`).then((r) => r.json()).then(setDeadSaves);
    fetch(`${API}/library/top-saved-artists?limit=20`).then((r) => r.json()).then(setTopArtists);
  }, []);

  const healthTabs = [
    { id: "duplicates", label: `Duplicates${duplicates ? ` (${duplicates.duplicates.length})` : ""}` },
    { id: "dead", label: `Dead Saves${deadSaves ? ` (${deadSaves.dead_saves.length})` : ""}` },
    { id: "artists", label: "Top Artists" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: MOOD.happy.tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 36px" }}>
          <PageHeader
            kicker="Nº 02 · Collection"
            title="The Collection"
            lede={<>{total ? total.toLocaleString() : "11,770"} songs — sorted, filtered, and actually findable.</>}
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

            {/* Decade */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
              <span style={{ ...TYPE.micro, marginRight: 4 }}>Release decade</span>
              {DECADES.map((d) => (
                <Pill key={d.label} active={decade.label === d.label} onClick={() => setDecade(d)} style={{ minHeight: 32, padding: "5px 12px", fontSize: 11 }}>
                  {d.label}
                </Pill>
              ))}
            </div>

            {/* Advanced filters */}
            <div style={{ marginBottom: 20 }}>
              <Expander label="Filters" sublabel="mood · energy · BPM · artist">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, paddingTop: 6 }}>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Mood</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["any", "happy", "dark"].map((m) => (
                        <Pill key={m} active={mood === m} onClick={() => setMood(m)} style={{ minHeight: 34, padding: "6px 12px", textTransform: "capitalize" }}>{m}</Pill>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Min Energy</div>
                    <Input type="number" step="0.1" min="0" max="1" value={minEnergy} onChange={(e) => setMinEnergy(e.target.value)} placeholder="0.0 – 1.0" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>BPM Range</div>
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
              <Button
                variant="ghost"
                onClick={() => load(offset)}
                disabled={loading}
                style={{ width: "100%", marginTop: 16, padding: "14px" }}
              >
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
                  <p style={{ ...TYPE.body, marginBottom: 18 }}>Songs saved over a year ago that never appear in your listening history.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {deadSaves.dead_saves.map((s, i) => (
                      <Card key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.name}</div>
                          <div style={{ fontSize: 13, color: C.sub }}>{s.artist}</div>
                          <div style={{ ...TYPE.micro, color: C.faint, marginTop: 6, letterSpacing: "0.5px" }}>Saved {s.saved_at}</div>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.muted, flexShrink: 0 }}>
                          {s.energy != null && <span>E {Math.round(s.energy * 100)}%</span>}
                          {s.valence != null && <span>M {Math.round(s.valence * 100)}%</span>}
                        </div>
                      </Card>
                    ))}
                  </div>
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
