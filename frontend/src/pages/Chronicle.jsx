import { useEffect, useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import usePreview from "../hooks/usePreview";
import { C, TYPE, FONT, MOOD } from "../theme";
import { PageHeader, StatBlock, Card, Pill, Department, Expander, TrackRow, EmptyState, PullQuote, Reveal } from "../ui";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const PINK = "#ec4899";

const FEATURES = [
  { key: "valence", label: "Mood", color: C.green },
  { key: "energy", label: "Energy", color: C.amber },
  { key: "acousticness", label: "Acoustic", color: C.indigo },
  { key: "danceability", label: "Danceability", color: PINK },
];
const ERA_COLORS = [C.green, C.indigo, C.amber, PINK, C.blue, "#10b981", C.red, C.violet];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mkey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

function eraMoodColor(label) {
  if (!label) return C.muted;
  if (label === "Dark" || label === "Melancholic") return C.indigo;
  if (label === "Bright" || label === "Upbeat") return C.green;
  return C.amber;
}

function ChartTooltip({ active, payload, label, labeled_months }) {
  if (!active || !payload?.length) return null;
  const md = labeled_months?.find((m) => m.month === label);
  return (
    <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", fontSize: 12, minWidth: 160 }}>
      <div style={{ color: C.sub, marginBottom: 8, fontWeight: 600 }}>
        {label}
        {md?.era_name && <span style={{ marginLeft: 8, color: C.muted, fontSize: 11, fontStyle: "italic" }}>{md.era_name}</span>}
      </div>
      {payload.map((p) => {
        const feat = FEATURES.find((f) => f.key === p.dataKey);
        const word = p.dataKey === "valence" && md?.mood_label ? ` · ${md.mood_label}` : p.dataKey === "energy" && md?.energy_label ? ` · ${md.energy_label}` : p.dataKey === "acousticness" && md?.acoustic_label ? ` · ${md.acoustic_label}` : "";
        return (
          <div key={p.dataKey} style={{ color: p.stroke, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>{feat?.label}</span><span style={{ fontWeight: 700 }}>{Math.round(p.value * 100)}%{word}</span>
          </div>
        );
      })}
      {md?.plays != null && <div style={{ color: C.label, marginTop: 8, fontSize: 11, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>{md.plays} plays this month</div>}
    </div>
  );
}

export default function Chronicle() {
  const [insights, setInsights] = useState(null);
  const [loadingIns, setLoadingIns] = useState(true);
  const [active, setActive] = useState(["valence", "energy"]);
  const [selEra, setSelEra] = useState(null);

  // Rewind
  const [allMonths, setAllMonths] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [sortBy, setSortBy] = useState("saved_at");
  const { playing, play } = usePreview();

  useEffect(() => {
    fetch(`${API}/stats/taste-timeline-insights`).then((r) => r.json()).then((d) => { setInsights(d); setLoadingIns(false); }).catch(() => setLoadingIns(false));
    fetch(`${API}/library/monthly-rewind`).then((r) => r.json()).then((d) => { setAllMonths(d.months || []); if (d.months?.length) setYear(d.months[0].year); }).catch(() => {});
  }, []);

  const toggleFeature = useCallback((k) => setActive((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k])), []);

  const countMap = useMemo(() => { const m = {}; allMonths.forEach((x) => { m[mkey(x.year, x.month)] = x.track_count; }); return m; }, [allMonths]);
  const years = useMemo(() => [...new Set(allMonths.map((m) => m.year))].sort((a, b) => b - a), [allMonths]);
  const selectedSorted = useMemo(() => [...selected].sort(), [selected]);
  const selectedSongTotal = selectedSorted.reduce((s, k) => s + (countMap[k] || 0), 0);

  const toggleMonth = (y, m) => {
    if (!countMap[mkey(y, m)]) return;
    setSelected((prev) => { const n = new Set(prev); const k = mkey(y, m); n.has(k) ? n.delete(k) : n.add(k); return n; });
    setPreview(null); setResult(null);
  };
  const rangeLabel = () => {
    if (!selectedSorted.length) return "No months selected";
    if (selectedSorted.length === 1) { const [y, m] = selectedSorted[0].split("-"); return `${MONTHS[+m - 1]} ${y}`; }
    const fmt = (k) => { const [y, m] = k.split("-"); return `${ABBR[+m - 1]} ${y}`; };
    return `${fmt(selectedSorted[0])} → ${fmt(selectedSorted[selectedSorted.length - 1])} · ${selectedSorted.length} months`;
  };
  const loadPreview = async () => {
    if (!selectedSorted.length) return;
    setLoadingPrev(true); setPreview(null); setResult(null);
    try { const r = await fetch(`${API}/library/range-tracks?months=${selectedSorted.join(",")}`); const d = await r.json(); setPreview(d.tracks || []); } catch (e) { console.error(e); }
    setLoadingPrev(false);
  };
  const createPlaylist = async () => {
    if (!preview?.length) return;
    setCreating(true);
    try { const r = await fetch(`${API}/library/multi-month-playlist?months=${selectedSorted.join(",")}`, { method: "POST" }); setResult(await r.json()); } catch (e) { setResult({ success: false, message: String(e) }); }
    setCreating(false);
  };
  const sorted = useMemo(() => {
    if (!preview) return [];
    const s = [...preview];
    switch (sortBy) {
      case "energy": return s.sort((a, b) => (b.energy || 0) - (a.energy || 0));
      case "valence": return s.sort((a, b) => (b.valence || 0) - (a.valence || 0));
      case "tempo": return s.sort((a, b) => (b.tempo || 0) - (a.tempo || 0));
      case "artist": return s.sort((a, b) => a.artist.localeCompare(b.artist));
      case "release_year": return s.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      default: return s.sort((a, b) => b.saved_at?.localeCompare(a.saved_at));
    }
  }, [preview, sortBy]);

  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  const selectedEraObj = selEra && insights?.eras ? insights.eras.find((e) => e.name === selEra) : null;

  const previewStats = preview ? [
    { label: "Songs", value: preview.length },
    { label: "Avg BPM", value: Math.round(preview.reduce((s, t) => s + (t.tempo || 0), 0) / (preview.filter((t) => t.tempo).length || 1)) || "—" },
    { label: "Avg Energy", value: preview.filter((t) => t.energy).length ? `${Math.round((preview.reduce((s, t) => s + (t.energy || 0), 0) / preview.filter((t) => t.energy).length) * 100)}%` : "—" },
    { label: "Artists", value: new Set(preview.map((t) => t.artist)).size },
  ] : [];

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: MOOD.neutral.tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 36px" }}>
          <PageHeader
            kicker="Nº 04 · Timeline"
            title="Timeline"
            accent={C.amber}
            lede="How your taste has drifted, chapter by chapter — and every song you saved, month by month."
          />
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 64px" }}>
        {/* THE STORY */}
        <Reveal>
          <Department no="—" title="The Story" right={insights?.enough_data && <span style={{ ...TYPE.micro, color: C.muted }}>{insights.total_months} months</span>} />
          {loadingIns ? (
            <div style={{ ...TYPE.body }}>Analyzing your taste timeline…</div>
          ) : !insights?.enough_data ? (
            <EmptyState
              icon="📈"
              title={(insights?.months_have ?? 0) === 0 ? "No listening history yet" : `${insights?.months_have} of ${insights?.months_needed ?? 2} months collected`}
              hint="Your taste story needs at least 2 months of listening history. Keep the poller running and check back — the Monthly Rewind below works right now."
            />
          ) : (
            <>
              {insights.narrative && (
                <div style={{ marginBottom: 28 }}>
                  <PullQuote accent={C.amber} cite={insights.current_chapter ? `Current chapter — ${insights.current_chapter}` : null}>
                    {insights.narrative}
                  </PullQuote>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 28 }}>
                {insights.mood_drift != null && (
                  <StatBlock value={`${insights.mood_drift > 0 ? "+" : ""}${insights.mood_drift}%`} label="Mood drift" sub={insights.mood_drift > 0 ? "Getting brighter" : "Getting darker"} accent={insights.mood_drift > 0 ? C.green : C.indigo} />
                )}
                {insights.energy_drift != null && (
                  <StatBlock value={`${insights.energy_drift > 0 ? "+" : ""}${insights.energy_drift}%`} label="Energy drift" sub={insights.energy_drift > 0 ? "More intense" : "More mellow"} accent={insights.energy_drift > 0 ? C.amber : C.indigo} />
                )}
                {insights.biggest_mood_shift && (
                  <StatBlock value={insights.biggest_mood_shift.month} label="Biggest mood shift" sub={`${insights.biggest_mood_shift.from_label} → ${insights.biggest_mood_shift.to_label}`} accent="#fff" />
                )}
                {insights.biggest_energy_shift && (
                  <StatBlock value={insights.biggest_energy_shift.month} label="Biggest energy shift" sub={`${insights.biggest_energy_shift.from_label} → ${insights.biggest_energy_shift.to_label}`} accent="#fff" />
                )}
              </div>

              {insights.eras.length > 1 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ ...TYPE.micro, marginBottom: 10 }}>Your listening eras — tap to highlight</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {insights.eras.map((era, i) => {
                      const isSel = selEra === era.name;
                      const col = ERA_COLORS[i % ERA_COLORS.length];
                      return (
                        <Pill key={era.name + era.start} active={isSel} onClick={() => setSelEra(isSel ? null : era.name)} style={isSel ? { background: col, borderColor: col } : {}}>
                          {era.name}
                          <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 400 }}>{era.months.length === 1 ? era.start : `${era.start} – ${era.end}`}</span>
                        </Pill>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {FEATURES.map((f) => (
                  <Pill key={f.key} active={active.includes(f.key)} onClick={() => toggleFeature(f.key)} style={active.includes(f.key) ? { background: f.color, borderColor: f.color } : {}}>{f.label}</Pill>
                ))}
              </div>

              <Card style={{ padding: "24px 16px 16px", marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={insights.labeled_months} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="month" tick={{ fill: C.label, fontSize: 11, fontFamily: FONT.body }} tickFormatter={(m) => m.slice(2)} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis domain={[0, 1]} tick={{ fill: C.label, fontSize: 11, fontFamily: FONT.body }} tickFormatter={(v) => `${Math.round(v * 100)}%`} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip labeled_months={insights.labeled_months} />} />
                    {selectedEraObj && selectedEraObj.months.length >= 1 && (
                      <ReferenceArea x1={selectedEraObj.months[0]} x2={selectedEraObj.months[selectedEraObj.months.length - 1]} strokeOpacity={0} fill="#ffffff" fillOpacity={0.04} />
                    )}
                    {insights.biggest_mood_shift && <ReferenceLine x={insights.biggest_mood_shift.month} stroke="#ffffff18" strokeDasharray="4 4" />}
                    {FEATURES.filter((f) => active.includes(f.key)).map((f) => (
                      <Line key={f.key} type="monotone" dataKey={f.key} stroke={f.color} strokeWidth={2} dot={{ r: 3, fill: f.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: f.color, strokeWidth: 0 }} name={f.label} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Expander label="Monthly breakdown" sublabel="every month, scored">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Month", "Era", "Mood", "Energy", "Acoustic", "Dance", "BPM", "Plays"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 14px", ...TYPE.micro, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...insights.labeled_months].reverse().map((row, i) => {
                        const isHl = selectedEraObj?.months.includes(row.month);
                        return (
                          <tr key={row.month} style={{ borderBottom: `1px solid ${C.border}`, background: isHl ? "#ffffff06" : i % 2 === 0 ? "transparent" : "#0a0a0a" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{row.month}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#000", background: eraMoodColor(row.mood_label), borderRadius: 10, padding: "2px 8px" }}>{row.era_name || "—"}</span></td>
                            <td style={{ padding: "10px 14px", color: eraMoodColor(row.mood_label), fontWeight: 600 }}>{row.mood_label || "—"}{row.mood_pct != null && <span style={{ color: C.muted, fontWeight: 400, marginLeft: 4 }}>{row.mood_pct}%</span>}</td>
                            <td style={{ padding: "10px 14px", color: C.amber, fontWeight: 600 }}>{row.energy_label || "—"}{row.energy_pct != null && <span style={{ color: C.muted, fontWeight: 400, marginLeft: 4 }}>{row.energy_pct}%</span>}</td>
                            <td style={{ padding: "10px 14px", color: C.indigo }}>{row.acoustic_label || "—"}</td>
                            <td style={{ padding: "10px 14px", color: PINK }}>{row.danceability != null ? `${Math.round(row.danceability * 100)}%` : "—"}</td>
                            <td style={{ padding: "10px 14px", color: C.sub }}>{row.tempo != null ? Math.round(row.tempo) : "—"}</td>
                            <td style={{ padding: "10px 14px", color: C.muted }}>{row.plays}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Expander>
            </>
          )}
        </Reveal>

        {/* MONTHLY REWIND */}
        <Reveal>
          <div style={{ marginTop: 48 }}>
            <Department no="—" title="Monthly Rewind" right={<span style={{ ...TYPE.micro, color: C.muted }}>save a month as a playlist</span>} />

            <Card style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...TYPE.micro, marginBottom: 10 }}>Year</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 130 }}>
                    {years.map((y) => <Pill key={y} active={year === y} onClick={() => setYear(y)} style={{ minHeight: 32, padding: "5px 12px", fontSize: 12 }}>{y}</Pill>)}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ ...TYPE.micro, marginBottom: 10 }}>Months — tap to select one or several (across years too)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(74px, 1fr))", gap: 6 }}>
                    {MONTHS.map((mName, i) => {
                      const num = i + 1;
                      const k = mkey(year, num);
                      const count = countMap[k] || 0;
                      const isSel = selected.has(k);
                      const disabled = (year === thisYear && num > thisMonth) || count === 0;
                      return (
                        <button key={mName} onClick={() => toggleMonth(year, num)} disabled={disabled} title={count ? `${count} songs` : "no saves"}
                          style={{ padding: "9px 4px", borderRadius: 10, border: `1px solid ${isSel ? C.green : "transparent"}`, background: isSel ? C.greenBg : "#151515", color: disabled ? "#2a2a2a" : isSel ? C.green : C.sub, fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer", textAlign: "center", lineHeight: 1.3 }}>
                          <div>{mName.slice(0, 3)}</div>
                          <div style={{ fontSize: 10, color: disabled ? "#222" : isSel ? C.green : C.label }}>{count || "—"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT.display }}>{rangeLabel()}</span>
                  {selectedSongTotal > 0 && <span style={{ color: C.muted, fontSize: 14, marginLeft: 12 }}>{selectedSongTotal} songs total</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {selected.size > 0 && <Pill active={false} onClick={() => { setSelected(new Set()); setPreview(null); setResult(null); }}>Clear</Pill>}
                  <Button onClick={loadPreview} disabled={loadingPrev || selected.size === 0}>{loadingPrev ? "Loading…" : "Preview Songs →"}</Button>
                </div>
              </div>
            </Card>

            {preview !== null && !loadingPrev && (
              preview.length === 0 ? <EmptyState title="No songs in the selected months" /> : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...TYPE.micro, marginRight: 4 }}>Sort</span>
                    {[{ v: "saved_at", l: "Save Date" }, { v: "energy", l: "Energy" }, { v: "valence", l: "Mood" }, { v: "tempo", l: "BPM" }, { v: "artist", l: "Artist" }, { v: "release_year", l: "Year" }].map((s) => (
                      <Pill key={s.v} active={sortBy === s.v} onClick={() => setSortBy(s.v)} style={{ minHeight: 32, padding: "5px 12px", fontSize: 12 }}>{s.l}</Pill>
                    ))}
                    <div style={{ marginLeft: "auto" }}>
                      {result?.success ? (
                        <a href={result.playlist_url} target="_blank" rel="noreferrer" style={{ padding: "9px 20px", borderRadius: 10, background: C.green, color: "#000", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Open in Spotify ↗</a>
                      ) : (
                        <Button onClick={createPlaylist} disabled={creating}>{creating ? "Creating…" : `Create Playlist (${preview.length})`}</Button>
                      )}
                    </div>
                  </div>

                  {result && !result.success && <div style={{ background: C.redBg, border: "1px solid #5a1a1a", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>{result.message}</div>}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20, marginBottom: 24 }}>
                    {previewStats.map((s) => <StatBlock key={s.label} value={s.value} label={s.label} />)}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {sorted.map((t) => <TrackRow key={t.id} track={t} playing={playing} onPlay={play} />)}
                  </div>
                </>
              )
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
