import { useState, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import SwipeDeck from "../components/SwipeDeck";
import { C, TYPE, FONT, MOOD, input, SECTION, PAGE_BG } from "../theme";
import { PageHeader, Card, Pill, Department, Expander, Input, Button, TrackRow, EmptyState, Reveal } from "../ui";
import Masthead from "../ui/Masthead";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIMIT = 50;

const AC  = SECTION[2].color;
const AW  = SECTION[2].wash;
const AON = SECTION[2].on;

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

// Masthead view-toggle: metallic amber buttons on the brushed-steel band.
const heroTag = (active) => ({
  padding: "8px 15px", borderRadius: 4, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer",
  border: `1px solid ${active ? AC : C.border2}`, transition: "all 0.15s",
  background: active ? AC : "transparent", color: active ? C.ink2 : C.ink,
});

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
  const [healthTab, setHealthTab] = useState("duplicates");
  const [deadShown, setDeadShown] = useState(60);
  const [swipe, setSwipe] = useState(false);

  const unsave = async (ids) => {
    if (!ids?.length) return;
    try {
      await fetch(`${API}/library/unsave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    } catch { /* ignore */ }
  };
  const reloadHealth = () => {
    fetch(`${API}/library/duplicates`).then((r) => r.json()).then(setDuplicates).catch(() => {});
    fetch(`${API}/library/dead-saves`).then((r) => r.json()).then(setDeadSaves).catch(() => {});
  };

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
  }, []);

  const activeFilterCount =
    decades.length + (language ? 1 : 0) +
    (minEnergy ? 1 : 0) + (maxEnergy ? 1 : 0) + (minTempo ? 1 : 0) + (maxTempo ? 1 : 0) + (artist ? 1 : 0);

  const healthTabs = [
    { id: "duplicates", label: `Duplicates${duplicates ? ` (${duplicates.duplicates.length})` : ""}` },
    { id: "dead", label: `Dead Saves${deadSaves ? ` (${(deadSaves.total ?? deadSaves.dead_saves?.length) || 0})` : ""}` },
  ];

  const deadCards = (deadSaves?.dead_saves || []).map((s) => ({
    key: s.id, id: s.id, title: s.name, sub: s.artist,
    meta: `saved ${(s.saved_at || "").slice(0, 10)} · ${s.last_played ? "last played " + s.last_played.slice(0, 10) : "never played"}`,
  }));
  const dupCards = (duplicates?.duplicates || []).map((d) => ({
    key: (d.track_ids && d.track_ids[0]) || d.name, id: d.track_ids && d.track_ids[0],
    title: d.name, sub: d.artist, meta: `${d.copies} copies · removes the extras, keeps one`,
    removeIds: (d.track_ids || []).slice(1),
  }));

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>

      <Masthead
        no="02" section="Collection" title="The Collection"
        lede={<>{total ? total.toLocaleString() : "…"} songs: sorted, filtered, and in one piece</>}
        actions={<>
          <button style={heroTag(mode === "browse")} onClick={() => setMode("browse")}>Browse</button>
          <button style={heroTag(mode === "health")} onClick={() => setMode("health")}>Library Health</button>
        </>}
      />

      {/* ── Stat strip: metallic card overlapping the band edge ── */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
        <Card style={{ marginTop: -34, border: `1px solid ${C.border2}`, boxShadow: "0 14px 40px rgba(0,0,0,0.5)", padding: "20px 24px", position: "relative" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 36px", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: FONT.display, fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 800, color: C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {total ? total.toLocaleString() : "—"}
              </div>
              <div style={{ ...TYPE.micro, marginTop: 4 }}>Saved Tracks</div>
            </div>
            <div style={{ width: 1, height: 36, background: C.border2, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: FONT.display, fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 800, color: AC, lineHeight: 1 }}>
                {duplicates ? duplicates.duplicates.length : "—"}
              </div>
              <div style={{ ...TYPE.micro, marginTop: 4 }}>Duplicates</div>
            </div>
            <div style={{ width: 1, height: 36, background: C.border2, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: FONT.display, fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 800, color: C.amber, lineHeight: 1 }}>
                {deadSaves ? (deadSaves.total ?? deadSaves.dead_saves?.length ?? 0).toLocaleString() : "—"}
              </div>
              <div style={{ ...TYPE.micro, marginTop: 4 }}>Dead Saves</div>
            </div>
            <div style={{ width: 1, height: 36, background: C.border2, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: FONT.display, fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 800, color: C.ink, lineHeight: 1 }}>
                {moods.length + activeFilterCount > 0 ? moods.length + activeFilterCount : "0"}
              </div>
              <div style={{ ...TYPE.micro, marginTop: 4 }}>Active Filters</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 64px" }}>
        {mode === "browse" ? (
          <Reveal>
            {/* ── Moods — boxy mono tags, multi-select ── */}
            <Card style={{ marginBottom: 20, border: `1px solid ${C.border2}`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                <div style={{ ...TYPE.micro }}>Moods — combine any · a song can match several</div>
                {moods.length > 0 && (
                  <button
                    onClick={() => setMoods([])}
                    style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.08em", padding: 0 }}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {moodList.length === 0 && <span style={{ ...TYPE.body, fontSize: 12 }}>Reading the room…</span>}
                {moodList.map((m) => (
                  <Pill key={m.key} active={moods.includes(m.key)} onClick={() => toggleMood(m.key)} style={{ minHeight: 36, borderRadius: 3 }}>
                    {m.label}
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, opacity: 0.55, marginLeft: 5 }}>{(m.count || 0).toLocaleString()}</span>
                  </Pill>
                ))}
              </div>
            </Card>

            {/* ── Sort strip ── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...TYPE.micro, marginBottom: 12 }}>Sort by</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {SORT_OPTIONS.map((s) => (
                  <Pill
                    key={s.value}
                    active={sortBy === s.value}
                    onClick={() => {
                      if (sortBy === s.value) setOrder((o) => (o === "desc" ? "asc" : "desc"));
                      else { setSortBy(s.value); setOrder("desc"); }
                    }}
                    style={{ minHeight: 36, padding: "8px 14px", borderRadius: 3 }}
                  >
                    {s.label}{sortBy === s.value ? (order === "desc" ? " ↓" : " ↑") : ""}
                  </Pill>
                ))}
              </div>
            </div>

            {/* ── Decades — multi-select boxy tabs ── */}
            <div style={{ marginBottom: 20, marginTop: 16 }}>
              <div style={{ ...TYPE.micro, marginBottom: 12 }}>Era — pick any decade</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill
                  active={decades.length === 0}
                  onClick={() => setDecades([])}
                  style={{ minHeight: 34, padding: "6px 14px", borderRadius: 3, fontSize: 11, fontFamily: FONT.mono }}
                >
                  All
                </Pill>
                {DECADES.map((d) => (
                  <Pill
                    key={d.start}
                    active={decades.includes(d.start)}
                    onClick={() => toggleDecade(d.start)}
                    style={{ minHeight: 34, padding: "6px 14px", borderRadius: 3, fontSize: 11, fontFamily: FONT.mono }}
                  >
                    {d.label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* ── More filters expander ── */}
            <div style={{ marginBottom: 24 }}>
              <Expander label="More filters" sublabel={activeFilterCount ? `${activeFilterCount} active` : "language · energy · BPM · artist"}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, paddingTop: 6 }}>
                  <div>
                    <div style={{ ...TYPE.micro, marginBottom: 8 }}>Language</div>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      style={input({ width: "100%", cursor: "pointer", color: language ? C.ink : C.muted })}
                    >
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
                      <Input
                        value={artistInput}
                        onChange={(e) => setArtistInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && setArtist(artistInput)}
                        placeholder="Filter artist…"
                        style={{ flex: 1 }}
                      />
                      <Button onClick={() => setArtist(artistInput)} style={{ padding: "9px 14px" }}>Go</Button>
                      {artist && <Button variant="ghost" onClick={() => { setArtist(""); setArtistInput(""); }} style={{ padding: "9px 12px" }}>✕</Button>}
                    </div>
                  </div>
                </div>
              </Expander>
            </div>

            {/* ── Results count ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderTop: `1px solid ${C.border2}`, paddingTop: 18 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: C.muted }}>
                {loading && tracks.length === 0 ? "Loading…" : `${tracks.length.toLocaleString()} of ${total.toLocaleString()} songs`}
              </span>
              {(moods.length > 0 || activeFilterCount > 0) && (
                <span style={{
                  fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "1px", padding: "3px 8px", borderRadius: 3,
                  border: `1.5px solid ${AC}`, color: AC,
                }}>
                  {moods.length + activeFilterCount} filter{moods.length + activeFilterCount !== 1 ? "s" : ""} on
                </span>
              )}
            </div>

            {/* ── Track list ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tracks.map((t) => <TrackRow key={t.id} track={t} playing={playing} onPlay={play} />)}
            </div>

            {/* ── Load more ── */}
            {tracks.length < total && (
              <Button
                variant="ghost"
                onClick={() => load(offset)}
                disabled={loading}
                style={{ width: "100%", marginTop: 16, padding: "14px" }}
              >
                {loading ? "Loading…" : `Load more — ${(total - tracks.length).toLocaleString()} remaining`}
              </Button>
            )}
          </Reveal>
        ) : (
          <Reveal>
            {/* ── Library Health masthead ── */}
            <Department
              no="—"
              title="Library Health"
              right={<span style={{ ...TYPE.micro, color: C.muted }}>Fix what Spotify won't</span>}
            />

            {/* ── Health tab strip ── */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
              {healthTabs.map((t) => (
                <Pill
                  key={t.id}
                  active={healthTab === t.id}
                  onClick={() => { setHealthTab(t.id); setSwipe(false); }}
                  style={{ borderRadius: 3 }}
                >
                  {t.label}
                </Pill>
              ))}
              <Pill
                active={swipe}
                onClick={() => { if (swipe) reloadHealth(); setSwipe((s) => !s); }}
                style={{ borderRadius: 3 }}
              >
                {swipe ? "← Back to list" : "🃏 Swipe to clean up"}
              </Pill>
            </div>

            {swipe ? (
              <div style={{ padding: "8px 0 24px" }}>
                <p style={{ ...TYPE.body, textAlign: "center", maxWidth: 420, margin: "0 auto 24px" }}>
                  Swipe <span style={{ color: C.red, fontWeight: 700 }}>left to un-save</span> from Spotify,{" "}
                  <span style={{ color: AC, fontWeight: 700 }}>right to keep</span>. Tap ▶ to hear it first.
                </p>
                <SwipeDeck
                  cards={healthTab === "dead" ? deadCards : dupCards}
                  onRemove={(card) => unsave(healthTab === "dead" ? [card.id] : card.removeIds)}
                />
              </div>
            ) : (
              <>
                {healthTab === "duplicates" && (
                  !duplicates ? (
                    <div style={{ ...TYPE.body, padding: "20px 0" }}>Scanning…</div>
                  ) : duplicates.duplicates.length === 0 ? (
                    <EmptyState icon="✓" title="No duplicates found" hint="Your library is clean." />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {duplicates.duplicates.map((d, i) => (
                        <Card
                          key={i}
                          className="lift"
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            gap: 12, border: `1px solid ${C.border2}`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{d.name}</div>
                            <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{d.artist}</div>
                            <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: C.muted, marginTop: 6 }}>
                              Saved {d.saved_dates?.map((x) => x.slice(0, 10)).join(", ")}
                            </div>
                          </div>
                          {/* Boxy badge — red bg, ink border, NOT pill */}
                          <div style={{
                            background: C.redBg, color: C.red, border: `1.5px solid ${C.red}`,
                            borderRadius: 3, padding: "4px 10px", fontFamily: FONT.mono,
                            fontSize: 12, fontWeight: 700, flexShrink: 0, letterSpacing: "0.5px",
                          }}>
                            {d.copies}×
                          </div>
                        </Card>
                      ))}
                    </div>
                  )
                )}

                {healthTab === "dead" && (
                  !deadSaves ? (
                    <div style={{ ...TYPE.body, padding: "20px 0" }}>Scanning…</div>
                  ) : (
                    <>
                      {/* Dead saves stat */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontFamily: FONT.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, color: C.amber, lineHeight: 0.95, letterSpacing: "-0.02em" }}>
                          {(deadSaves.total ?? deadSaves.dead_saves.length).toLocaleString()}
                        </span>
                        <span style={{ ...TYPE.micro }}>forgotten saves</span>
                      </div>
                      <p style={{ ...TYPE.body, marginBottom: 20 }}>
                        Saved over a year ago and never played since — or never played at all.
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {deadSaves.dead_saves.slice(0, deadShown).map((s, i) => (
                          <Card
                            key={i}
                            className="lift"
                            style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              gap: 12, padding: "12px 16px",
                              border: `1.5px solid ${C.line}`, boxShadow: "none",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                              <div style={{ fontSize: 13, color: C.sub }}>{s.artist}</div>
                            </div>
                            <div style={{ display: "flex", gap: 20, flexShrink: 0, textAlign: "right" }}>
                              <div>
                                <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: C.muted }}>Saved</div>
                                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub, marginTop: 2 }}>{s.saved_at || "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: C.muted }}>Last played</div>
                                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: s.last_played ? C.sub : C.red, marginTop: 2, fontWeight: s.last_played ? 400 : 700 }}>
                                  {s.last_played || "Never"}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>

                      {deadSaves.dead_saves.length > deadShown && (
                        <Button
                          variant="ghost"
                          onClick={() => setDeadShown((n) => n + 100)}
                          style={{ width: "100%", marginTop: 14, padding: "12px" }}
                        >
                          Show more — {(deadSaves.dead_saves.length - deadShown).toLocaleString()} more loaded
                        </Button>
                      )}
                    </>
                  )
                )}
              </>
            )}
          </Reveal>
        )}
      </div>
    </div>
  );
}
