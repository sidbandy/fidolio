import { useEffect, useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import { C, TYPE, FONT, MOOD, moodKey, axisTick, chartTooltip } from "../theme";
import { PageHeader, StatBlock, Card, Reveal, Pill, Department, EmptyState, InfoTip } from "../ui";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PERIODS = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const energyWord = (e) => (e >= 0.66 ? "Intense" : e >= 0.5 ? "Driven" : e >= 0.33 ? "Balanced" : "Calm");
const moodWord = (v) => (v < 0.35 ? "Dark" : v < 0.6 ? "Moody" : "Bright");
const pct = (n) => `${Math.round(n)}%`;
const lvl = (v) => (v >= 0.66 ? "high" : v >= 0.4 ? "moderate" : "low");

// ── Plain-language readings of the user's own data (for the ⓘ buttons) ──
function audioReading(a) {
  return `Built from your ${a.total_analyzed.toLocaleString()} analyzed songs. Your library is ${lvl(a.energy)} energy and ${lvl(a.danceability)} on danceability, with ${lvl(a.acousticness)} acousticness — ${a.acousticness < 0.4 ? "you favour produced, electronic-leaning music" : "you lean acoustic and organic"}. It's ${Math.round((1 - a.instrumentalness) * 100)}% vocal-forward, around ${Math.round(a.tempo)} BPM on average.`;
}
function moodReading(m) {
  const t = (m.dark + m.neutral + m.happy) || 1;
  const p = (x) => Math.round((x / t) * 100);
  const lead = m.happy >= m.dark && m.happy >= m.neutral ? "bright" : m.dark >= m.neutral ? "dark" : "neutral";
  return `Mood is "valence" — how upbeat a track sounds. Yours splits ${p(m.happy)}% bright, ${p(m.neutral)}% neutral, ${p(m.dark)}% dark, so your library leans ${lead}.`;
}
function energyReading(e) {
  const t = (e.calm + e.medium + e.intense) || 1;
  const p = (x) => Math.round((x / t) * 100);
  return `Energy is how intense/loud a track feels: you're ${p(e.calm)}% calm, ${p(e.medium)}% medium, ${p(e.intense)}% intense.`;
}
function langReading(langs) {
  if (!langs?.length) return "Detecting the languages across your library…";
  const t = langs.reduce((s, l) => s + l.count, 0) || 1;
  const top = langs[0];
  const others = langs.slice(1, 4).map((l) => l.language).join(", ");
  return `Detected from each track's title + artist. ${langs.length} languages — ${Math.round((top.count / t) * 100)}% ${top.language}${others ? `, plus ${others}` : ""}. A genuinely multilingual library.`;
}
const LANG_COLORS = ["#1db954", "#f59e0b", "#6366f1", "#8b5cf6", "#3b82f6", "#ef4444", "#555555"];
function buildLangParts(langs) {
  if (!langs?.length) return [];
  const top = langs.slice(0, 6).map((l, i) => ({ name: l.language, value: l.count, color: LANG_COLORS[i % LANG_COLORS.length] }));
  const other = langs.slice(6).reduce((s, l) => s + l.count, 0);
  if (other > 0) top.push({ name: "other", value: other, color: "#333" });
  return top;
}

// Compact, editorial distribution bar (replaces space-heavy donuts).
function StackBar({ title, parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...TYPE.micro, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: C.card2 }}>
        {parts.map((p) => (
          <div key={p.name} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.name} ${Math.round((p.value / total) * 100)}%`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
        {parts.map((p) => (
          <span key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.sub }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.name} {Math.round((p.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function RankRow({ i, title, sub, right, bar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <span style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 700, color: C.faint, width: 24, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
        {bar != null && (
          <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 7 }}>
            <div style={{ height: 3, borderRadius: 2, background: C.green, width: `${bar}%`, transition: "width 0.5s" }} />
          </div>
        )}
      </div>
      {right && <span style={{ color: C.muted, fontSize: 12, minWidth: 50, textAlign: "right" }}>{right}</span>}
    </div>
  );
}

export default function Identity() {
  const [sonic, setSonic] = useState(null);
  const [period, setPeriod] = useState("month");
  const [wrapped, setWrapped] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [languages, setLanguages] = useState(null);
  const [rhPage, setRhPage] = useState(0);

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then(setSonic);
    fetch(`${API}/stats/all-time`).then((r) => r.json()).then(setAllTime);
    fetch(`${API}/playlists/languages`).then((r) => r.json()).then((d) => setLanguages(d.languages || []));
  }, []);

  useEffect(() => {
    setWrapped(null);
    fetch(`${API}/stats/wrapped?period=${period}`).then((r) => r.json()).then(setWrapped);
  }, [period]);

  if (!sonic) {
    return (
      <div style={{ ...TYPE.body, display: "flex", alignItems: "center", justifyContent: "center", height: "70vh" }}>
        Analyzing your sound…
      </div>
    );
  }

  const { averages, mood_distribution, energy_distribution, dominant_key, rabbit_holes } = sonic;

  const radarData = [
    { feature: "Energy", value: Math.round(averages.energy * 100) },
    { feature: "Dance", value: Math.round(averages.danceability * 100) },
    { feature: "Mood", value: Math.round(averages.valence * 100) },
    { feature: "Acoustic", value: Math.round(averages.acousticness * 100) },
    { feature: "Vocal", value: Math.round((1 - averages.instrumentalness) * 100) },
    { feature: "Speech", value: Math.round(averages.speechiness * 100) },
  ];

  const headline = `${energyWord(averages.energy)} & ${moodWord(averages.valence)}`;
  const mk = moodKey(averages.valence);
  const accent = MOOD[mk].color;

  const hrs = Math.floor((wrapped?.total_minutes || 0) / 60);
  const mins = Math.round((wrapped?.total_minutes || 0) % 60);
  const clockMax = Math.max(...(wrapped?.listening_clock?.map((h) => h.plays) || [0])) || 1;

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* Cover */}
      <div style={{ background: MOOD[mk].tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 40px" }}>
          <PageHeader
            kicker="Nº 01 · Identity"
            title={headline}
            accent={accent}
            lede={
              <>
                Your library's fingerprint, built from{" "}
                <span style={{ color: "#fff" }}>{averages.total_analyzed.toLocaleString()}</span> analyzed songs.
                Average tempo <span style={{ color: "#fff" }}>{Math.round(averages.tempo)} BPM</span>, dominant key{" "}
                <span style={{ color: accent }}>{dominant_key}</span>.
              </>
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20 }}>
            <StatBlock value={Math.round(averages.tempo)} label="Avg BPM" format={(n) => Math.round(n)} />
            <StatBlock value={Math.round(averages.energy * 100)} label="Energy" format={pct} />
            <StatBlock value={Math.round(averages.danceability * 100)} label="Danceability" format={pct} />
            <StatBlock value={Math.round(averages.acousticness * 100)} label="Acoustic" format={pct} />
            <StatBlock value={dominant_key} label="Dominant Key" accent={accent} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 64px" }}>
        {/* Fingerprint */}
        <Reveal>
          <Department no="—" title="Fingerprint" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 20, marginBottom: 40 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ ...TYPE.micro }}>Audio Profile</div>
                <InfoTip title="Audio Profile">{audioReading(averages)}</InfoTip>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={C.border2} />
                  <PolarAngleAxis dataKey="feature" tick={{ ...axisTick, fill: C.sub }} />
                  <Radar dataKey="value" stroke={C.green} fill={C.green} fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 8 }}>
                {[["Tempo", `${Math.round(averages.tempo)} BPM`], ["Vocal", pct((1 - averages.instrumentalness) * 100)], ["Speech", pct(averages.speechiness * 100)], ["Acoustic", pct(averages.acousticness * 100)]].map(([l, v]) => (
                  <span key={l} style={{ fontSize: 11, color: C.sub }}><span style={{ color: C.muted }}>{l}</span> <b style={{ color: "#fff" }}>{v}</b></span>
                ))}
              </div>
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <div style={{ ...TYPE.micro }}>Distributions</div>
                <InfoTip title="Mood & Energy">{moodReading(mood_distribution)} {energyReading(energy_distribution)}</InfoTip>
              </div>
              <StackBar
                title="Mood"
                parts={[
                  { name: "Dark", value: mood_distribution.dark, color: C.indigo },
                  { name: "Neutral", value: mood_distribution.neutral, color: C.violet },
                  { name: "Happy", value: mood_distribution.happy, color: C.green },
                ]}
              />
              <StackBar
                title="Energy"
                parts={[
                  { name: "Calm", value: energy_distribution.calm, color: C.blue },
                  { name: "Medium", value: energy_distribution.medium, color: C.amber },
                  { name: "Intense", value: energy_distribution.intense, color: C.red },
                ]}
              />
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <div style={{ ...TYPE.micro }}>Languages</div>
                <InfoTip title="Languages">{langReading(languages)}</InfoTip>
              </div>
              {languages ? <StackBar title={`${languages.length} detected`} parts={buildLangParts(languages)} /> : <div style={{ ...TYPE.body, fontSize: 12 }}>Loading…</div>}
            </Card>
          </div>
        </Reveal>

        {/* Listening (Wrapped) */}
        <Reveal>
          <Department
            no="—"
            title="Listening"
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PERIODS.map((p) => (
                  <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)} style={{ minHeight: 34, padding: "6px 13px" }}>
                    {p.label}
                  </Pill>
                ))}
              </div>
            }
          />

          {!wrapped ? (
            <div style={{ ...TYPE.body, padding: "20px 0" }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 32 }}>
                <StatBlock value={`${hrs}h ${mins}m`} label="Listening Time" />
                <StatBlock value={wrapped.top_artists?.[0]?.artist || "—"} label="Top Artist" accent="#fff" />
                <StatBlock value={wrapped.top_songs?.[0]?.track || "—"} label="Top Song" accent="#fff" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 20 }}>
                <Card>
                  <div style={{ ...TYPE.micro, marginBottom: 18 }}>Top Artists</div>
                  {wrapped.top_artists?.length ? (
                    wrapped.top_artists.map((a, i) => (
                      <RankRow key={a.artist} i={i} title={a.artist} right={`${a.plays} plays`} bar={(a.plays / (wrapped.top_artists[0]?.plays || 1)) * 100} />
                    ))
                  ) : (
                    <EmptyState title="No listening history yet" hint="Keep the poller running and your top artists appear here." />
                  )}
                </Card>
                <Card>
                  <div style={{ ...TYPE.micro, marginBottom: 18 }}>Top Songs</div>
                  {wrapped.top_songs?.length ? (
                    wrapped.top_songs.map((s, i) => (
                      <RankRow key={s.track} i={i} title={s.track} sub={s.artist} right={`${s.plays}×`} />
                    ))
                  ) : (
                    <EmptyState title="No listening history yet" hint="Keep the poller running and your top songs appear here." />
                  )}
                </Card>
              </div>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ ...TYPE.micro, marginBottom: 18 }}>Listening Clock — When You Actually Listen</div>
                {wrapped.listening_clock?.every((h) => h.plays === 0) ? (
                  <EmptyState title="More data needed" hint="Keep the poller running to map your listening hours." />
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={wrapped.listening_clock} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hour" tick={axisTick} tickFormatter={(h) => (h % 6 === 0 ? `${h}:00` : "")} />
                      <YAxis tick={axisTick} />
                      <Tooltip formatter={(v) => [`${v} plays`, "Plays"]} labelFormatter={(h) => `${h}:00`} contentStyle={chartTooltip} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <Bar dataKey="plays" radius={[3, 3, 0, 0]}>
                        {wrapped.listening_clock.map((entry, i) => (
                          <Cell key={i} fill={entry.plays > 0 ? C.green : C.border} opacity={0.4 + (entry.plays / clockMax) * 0.6} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {allTime && (
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", padding: "4px 2px", ...TYPE.body, fontSize: 12 }}>
                  <span>Total plays ever <b style={{ color: "#fff" }}>{allTime.total_plays?.toLocaleString()}</b></span>
                  <span>Hours ever <b style={{ color: "#fff" }}>{allTime.estimated_hours}h</b></span>
                  <span>Tracking since <b style={{ color: "#fff" }}>{allTime.tracking_since}</b></span>
                  <span>All-time #1 <b style={{ color: C.green }}>{allTime.top_artists_all_time?.[0]?.artist || "—"}</b></span>
                </div>
              )}
            </>
          )}
        </Reveal>

        {/* Rabbit holes */}
        {rabbit_holes?.length > 0 && (() => {
          const pageSize = 5;
          const pages = Math.ceil(rabbit_holes.length / pageSize);
          const shown = rabbit_holes.slice(rhPage * pageSize, rhPage * pageSize + pageSize);
          const maxSaved = Math.max(...rabbit_holes.map((r) => r.songs_saved));
          const dayGap = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
          return (
            <Reveal>
              <div style={{ marginTop: 48 }}>
                <Department
                  no="—"
                  title="Rabbit Holes"
                  right={
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...TYPE.micro, color: C.muted }}>artists you binged hardest</span>
                      {pages > 1 && (
                        <Pill active={false} onClick={() => setRhPage((p) => (p + 1) % pages)} style={{ minHeight: 30, padding: "4px 12px", fontSize: 11 }}>↻ Refresh</Pill>
                      )}
                    </div>
                  }
                />
                <Card>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {shown.map((rh, idx) => {
                      const i = rhPage * pageSize + idx;
                      const days = dayGap(rh.first_save, rh.last_save);
                      return (
                        <div key={rh.artist} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 4px", borderTop: idx === 0 ? "none" : `1px solid ${C.border}` }}>
                          <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 700, color: C.faint, width: 26, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{rh.artist}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                              {days === 0 ? `${rh.songs_saved} songs in one sitting · ${rh.first_save}` : `${rh.songs_saved} songs over ${days} day${days === 1 ? "" : "s"} · ${rh.first_save} → ${rh.last_save}`}
                            </div>
                            <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 8, maxWidth: 320 }}>
                              <div style={{ height: 3, borderRadius: 2, background: C.green, width: `${(rh.songs_saved / maxSaved) * 100}%` }} />
                            </div>
                          </div>
                          <div style={{ ...TYPE.stat, fontSize: 26, color: C.green }}>{rh.songs_saved}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </Reveal>
          );
        })()}
      </div>
    </div>
  );
}
