import { useEffect, useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import { C, TYPE, FONT, MOOD, moodKey, axisTick, chartTooltip } from "../theme";
import { PageHeader, StatBlock, Card, Reveal, Pill, Department, EmptyState, InfoTip } from "../ui";
import ArtistAvatar from "../components/ArtistAvatar";

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
  const vocal = Math.round((1 - (a.instrumentalness ?? 0)) * 100);
  const moodLean = a.valence < 0.4 ? "darker and more introspective" : a.valence < 0.6 ? "emotionally balanced — neither bright nor bleak" : "bright and upbeat";
  const drive = a.energy >= 0.6 ? "you reach for music that drives and moves" : a.energy >= 0.45 ? "you like a steady, mid-energy pocket" : "you gravitate to calmer, slower-burning songs";
  const texture = a.acousticness < 0.35 ? "your sound is mostly produced and electronic-leaning" : a.acousticness < 0.6 ? "you mix produced and organic textures" : "you lean acoustic and organic";
  return `What this says about your taste: your library skews ${moodLean}, and ${drive}. ${texture[0].toUpperCase()}${texture.slice(1)}, and it's ${vocal}% vocal-forward — ${vocal >= 72 ? "voices and lyrics lead the songs you save" : "instrumentation and texture matter as much as the vocal"}. The radar is the shape of all that, averaged over ${a.total_analyzed.toLocaleString()} analyzed tracks.`;
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

// ── Charts: Top Artists podium (photos peek over the cards) + Top-100 list ──
function Podium({ artists }) {
  const top = artists.slice(0, 3).map((a, i) => ({ ...a, rank: i + 1 }));
  if (!top.length) return null;
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top; // 2nd · 1st · 3rd
  const max = top[0].songs || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, paddingTop: 56, flexWrap: "wrap" }}>
      {order.map((a) => {
        const first = a.rank === 1;
        const photo = first ? 96 : 74;
        return (
          <div key={a.artist} style={{ flex: "1 1 150px", maxWidth: 230, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", zIndex: 2, marginBottom: -(photo * 0.5) }}>
              <ArtistAvatar name={a.artist} size={photo} eager ring={`3px solid ${first ? C.green : C.border2}`} />
            </div>
            <Card style={{ width: "100%", textAlign: "center", overflow: "visible", paddingTop: photo * 0.5 + 16, minHeight: first ? 150 : 124, borderColor: first ? C.greenBd : C.border, background: first ? C.greenBg : C.card }}>
              <div style={{ fontFamily: FONT.display, fontSize: first ? 30 : 24, fontWeight: 700, color: first ? C.green : C.muted, lineHeight: 1 }}>{String(a.rank).padStart(2, "0")}</div>
              <div style={{ fontSize: first ? 16 : 14, fontWeight: 700, color: "#fff", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.artist}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{a.songs} songs</div>
              <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 10 }}>
                <div style={{ height: 3, borderRadius: 2, background: first ? C.green : C.sub, width: `${(a.songs / max) * 100}%` }} />
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// Continuous-size mosaic: each tile's pixel size scales smoothly with its count,
// so 39 reads bigger than 32 reads bigger than 30 — no plateaus, no cliffs.
const MOSAIC_WRAP = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" };
const scrim = {
  position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 9px 7px",
  background: "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0))",
};
// Map each item's count → a side length in [min,max], proportional across the set.
function sizeTiles(items, getCount, min = 66, max = 150) {
  const counts = items.map(getCount);
  const lo = Math.min(...counts), hi = Math.max(...counts);
  return items.map((it) => {
    const t = hi > lo ? (getCount(it) - lo) / (hi - lo) : 1;
    return { it, side: Math.round(min + t * (max - min)) };
  });
}

function ArtistTile({ a, rank, side }) {
  const big = side >= 110;
  return (
    <div style={{ width: side, height: side, position: "relative", borderRadius: 10, overflow: "hidden", background: C.card2, border: `1px solid ${C.border}` }}>
      <ArtistAvatar name={a.artist} fill radius={0} />
      <span style={{ position: "absolute", top: 6, left: 8, fontFamily: FONT.display, fontSize: big ? 14 : 11, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.85)", fontVariantNumeric: "tabular-nums" }}>{String(rank).padStart(2, "0")}</span>
      <div style={scrim}>
        <div style={{ fontSize: big ? 13 : 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.artist}</div>
        <div style={{ fontSize: 10, color: "#cfcfcf", marginTop: 1 }}>{a.songs} songs</div>
      </div>
    </div>
  );
}

function AlbumTile({ al, side }) {
  const initial = ((al.album || "?").trim()[0] || "?").toUpperCase();
  const big = side >= 110;
  return (
    <div style={{ width: side, height: side, position: "relative", borderRadius: 10, overflow: "hidden", background: C.card2, border: `1px solid ${C.border}` }}>
      {al.cover ? (
        <img src={al.cover} alt={al.album} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontSize: Math.round(side * 0.3), fontWeight: 700, color: C.faint }}>{initial}</div>
      )}
      {al.listen_session && (
        <div title={`Best run ${al.listen_session.run} tracks · ${al.listen_session.date}`} style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: "rgba(0,0,0,0.74)", border: `1px solid ${C.greenBd}` }}>
          <span style={{ color: C.green, fontSize: 9 }}>▶</span>
          {big && <span style={{ ...TYPE.micro, color: "#fff", letterSpacing: "0.5px", fontSize: 9 }}>in full</span>}
        </div>
      )}
      <div style={scrim}>
        <div style={{ fontSize: big ? 13 : 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.album}</div>
        {big && <div style={{ fontSize: 10, color: "#cfcfcf", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.artist}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.22)", borderRadius: 2 }}>
            <div style={{ height: 3, borderRadius: 2, background: C.green, width: `${Math.round((al.completion ?? 0) * 100)}%` }} />
          </div>
          <span style={{ fontSize: 9.5, color: "#cfcfcf", fontVariantNumeric: "tabular-nums" }}>{al.total_tracks ? `${al.owned}/${al.total_tracks}` : al.owned}</span>
        </div>
      </div>
    </div>
  );
}

const chartTab = (active) => ({
  padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: FONT.body,
  background: active ? C.green : "transparent", color: active ? "#000" : C.sub,
});

function Charts({ artists, albums }) {
  const [tab, setTab] = useState("artists");
  if (!artists || !albums) {
    return <div style={{ ...TYPE.body, padding: "40px 0" }}>Loading your charts…</div>;
  }
  const rest = artists.slice(3);
  return (
    <Reveal>
      <div style={{ display: "inline-flex", gap: 4, padding: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 28 }}>
        <button onClick={() => setTab("artists")} style={chartTab(tab === "artists")}>Top Artists</button>
        <button onClick={() => setTab("albums")} style={chartTab(tab === "albums")}>Top Albums</button>
      </div>

      {tab === "artists" ? (
        <>
          <Department no="—" title="Top Artists" right={<span style={{ ...TYPE.micro, color: C.muted }}>sized by songs saved</span>} />
          <Podium artists={artists} />
          {rest.length > 0 && (
            <div style={{ ...MOSAIC_WRAP, marginTop: 28 }}>
              {sizeTiles(rest, (a) => a.songs).map(({ it, side }, i) => <ArtistTile key={it.artist} a={it} rank={i + 4} side={side} />)}
            </div>
          )}
        </>
      ) : (
        <>
          <Department no="—" title="Top Albums" right={<span style={{ ...TYPE.micro, color: C.muted }}>sized by songs saved · ▶ played in full</span>} />
          {albums.length === 0 ? (
            <EmptyState title="No albums yet" hint="Save more tracks to build your album charts." />
          ) : (
            <div style={MOSAIC_WRAP}>
              {sizeTiles(albums, (al) => al.owned).map(({ it, side }) => <AlbumTile key={`${it.album}-${it.artist}`} al={it} side={side} />)}
            </div>
          )}
        </>
      )}
    </Reveal>
  );
}

export default function Identity() {
  const [sonic, setSonic] = useState(null);
  const [period, setPeriod] = useState("month");
  const [wrapped, setWrapped] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [languages, setLanguages] = useState(null);
  const [view, setView] = useState("fingerprint");
  const [topArtists, setTopArtists] = useState(null);
  const [topAlbums, setTopAlbums] = useState(null);

  // Lazy-load the Charts data the first time it's opened.
  useEffect(() => {
    if (view !== "charts" || topArtists) return;
    fetch(`${API}/library/top-saved-artists?limit=100`).then((r) => r.json()).then((d) => setTopArtists(d.artists || []));
    fetch(`${API}/stats/top-albums-rich?limit=18`).then((r) => r.json()).then((d) => setTopAlbums(d.albums || []));
  }, [view, topArtists]);

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then(setSonic);
    fetch(`${API}/stats/all-time`).then((r) => r.json()).then(setAllTime);
    fetch(`${API}/playlists/languages`).then((r) => r.json()).then((d) => setLanguages(d.languages || []));
    // Kick a live poll on open so "today" reflects very recent plays, then refresh.
    fetch(`${API}/stats/refresh-listening`, { method: "POST" })
      .then(() => new Promise((r) => setTimeout(r, 4000)))
      .then(() => {
        fetch(`${API}/stats/all-time`).then((r) => r.json()).then(setAllTime).catch(() => {});
        fetch(`${API}/stats/wrapped?period=${period}`).then((r) => r.json()).then(setWrapped).catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setWrapped(null);
    fetch(`${API}/stats/wrapped?period=${period}`).then((r) => r.json()).then(setWrapped);
  }, [period]);

  // Live revalidation: refetch on tab focus + every 8 min, so stats update
  // (e.g. "today" listening time) without a hard page reload.
  useEffect(() => {
    let alive = true;
    const refetch = () => {
      fetch(`${API}/stats/wrapped?period=${period}`).then((r) => r.json()).then((d) => alive && setWrapped(d)).catch(() => {});
      fetch(`${API}/stats/all-time`).then((r) => r.json()).then((d) => alive && setAllTime(d)).catch(() => {});
      fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then((d) => alive && setSonic(d)).catch(() => {});
    };
    const onVis = () => { if (!document.hidden) refetch(); };
    const id = setInterval(refetch, 8 * 60 * 1000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refetch);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refetch);
    };
  }, [period]);

  if (!sonic) {
    return (
      <div style={{ ...TYPE.body, display: "flex", alignItems: "center", justifyContent: "center", height: "70vh" }}>
        Analyzing your sound…
      </div>
    );
  }

  const { averages, mood_distribution, energy_distribution, signature_mood, peak_year, artist_count } = sonic;
  const groove = Math.round(((averages.energy + averages.danceability) / 2) * 100);

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
            actions={
              <div style={{ display: "flex", gap: 8 }}>
                <Pill active={view === "fingerprint"} onClick={() => setView("fingerprint")}>Fingerprint</Pill>
                <Pill active={view === "charts"} onClick={() => setView("charts")}>Charts</Pill>
              </div>
            }
            lede={
              <>
                Your library's fingerprint, built from{" "}
                <span style={{ color: "#fff" }}>{averages.total_analyzed.toLocaleString()}</span> analyzed songs.
                Average tempo <span style={{ color: "#fff" }}>{Math.round(averages.tempo)} BPM</span>
                {signature_mood && <>, and it leans <span style={{ color: accent }}>{signature_mood.toLowerCase()}</span></>}.
              </>
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20 }}>
            <StatBlock value={Math.round(averages.tempo)} label="Avg BPM" format={(n) => Math.round(n)} />
            <StatBlock value={groove} label="Groove" format={pct} />
            <StatBlock value={signature_mood || "—"} label="Signature Mood" accent={accent} />
            <StatBlock value={peak_year ? String(peak_year) : "—"} label="Peak Year" />
            <StatBlock value={artist_count || 0} label="Artists" format={(n) => Math.round(n).toLocaleString()} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 64px" }}>
        {view === "fingerprint" && (<>
        {/* Fingerprint */}
        <Reveal>
          <Department no="—" title="Fingerprint" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 20, marginBottom: 40 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
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
        </>)}

        {view === "charts" && <Charts artists={topArtists} albums={topAlbums} />}
      </div>
    </div>
  );
}
