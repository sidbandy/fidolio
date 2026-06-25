import { useEffect, useState, useRef } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie,
} from "recharts";
import { C, TYPE, FONT, SECTION, PAGE_BG, chromeText, moodKey, axisTick, chartTooltip } from "../theme";
import { PageHeader, StatBlock, Card, Reveal, Pill, Department, EmptyState, InfoTip } from "../ui";
import Masthead from "../ui/Masthead";
import ArtistAvatar from "../components/ArtistAvatar";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Identity owns the magenta department accent.
const AC = SECTION[1].color;
const AW = SECTION[1].wash;
const AON = SECTION[1].on;

// Masthead stat sizing (Syne is wide — keep the 5-up strip from clipping).
const STRIP_NUM = { fontSize: "clamp(22px, 2.6vw, 33px)" };
const STRIP_WORD = { fontSize: "clamp(15px, 1.9vw, 22px)", whiteSpace: "normal", lineHeight: 1.08, overflow: "visible", textOverflow: "clip" };

const PERIODS = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const energyWord = (e) => (e >= 0.66 ? "Intense" : e >= 0.5 ? "Driven" : e >= 0.33 ? "Balanced" : "Calm");
const moodWord = (v) => (v < 0.35 ? "Dark" : v < 0.6 ? "Moody" : "Bright");
const pct = (n) => `${Math.round(n)}%`;

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
// Curated brand series — vivid but coordinated (section + supporting tones).
const SERIES = ["#FFB23D", "#C9A86A", "#B8895A", "#7C93A6", "#CFC9BE", "#9A8E84", "#E0623C", "#3C372E"];
function buildLangParts(langs) {
  if (!langs?.length) return [];
  const top = langs.slice(0, 6).map((l, i) => ({ name: l.language, value: l.count, color: SERIES[i % SERIES.length] }));
  const other = langs.slice(6).reduce((s, l) => s + l.count, 0);
  if (other > 0) top.push({ name: "other", value: other, color: C.faint });
  return top;
}

// Donut ring — distribution visual.
function Donut({ parts, centerTop, centerSub, size = 132 }) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie data={shown} dataKey="value" nameKey="name" cx="50%" cy="50%"
               innerRadius={size * 0.33} outerRadius={size * 0.48} paddingAngle={2}
               stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
            {shown.map((p, i) => <Cell key={i} fill={p.color} />)}
          </Pie>
        </PieChart>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontFamily: FONT.fat, fontSize: 18, fontWeight: 800, color: C.ink, lineHeight: 1, textTransform: "capitalize" }}>{centerTop}</div>
          {centerSub != null && <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, marginTop: 3 }}>{centerSub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "3px 10px", marginTop: 10 }}>
        {shown.map((p) => (
          <span key={p.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.sub, fontFamily: FONT.mono }}>
            <span style={{ width: 8, height: 8, background: p.color, flexShrink: 0 }} />
            <span style={{ textTransform: "capitalize" }}>{p.name}</span>
            <b style={{ color: C.ink }}>{Math.round((p.value / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function topPart(parts) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0) || 1;
  const top = parts.reduce((a, b) => ((b.value || 0) > (a.value || 0) ? b : a), parts[0] || { name: "—", value: 0 });
  return { name: top.name, pct: Math.round(((top.value || 0) / total) * 100) };
}

function RankRow({ i, title, sub, right, bar, accent = C.ink }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 700, color: C.faint, width: 24, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
        {bar != null && (
          <div style={{ height: 4, background: C.border2, borderRadius: 0, marginTop: 7 }}>
            <div style={{ height: 4, background: accent, width: `${bar}%`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
          </div>
        )}
      </div>
      {right && <span style={{ fontFamily: FONT.mono, color: C.muted, fontSize: 11, minWidth: 50, textAlign: "right" }}>{right}</span>}
    </div>
  );
}

// ── Charts: Top Artists podium (photos peek over the cards) + mosaic ──
const MEDAL = { 1: "#E8C152", 2: "#C8CDD7", 3: "#C5874A" };       // gold · silver · bronze
const MEDAL_WASH = { 1: "rgba(232,193,82,0.13)", 2: "rgba(200,205,215,0.10)", 3: "rgba(197,135,74,0.11)" };
const MEDAL_GLOW = { 1: "0 0 32px rgba(232,193,82,0.30)", 2: "0 0 26px rgba(200,205,215,0.20)", 3: "0 0 26px rgba(197,135,74,0.24)" };

function Podium({ artists }) {
  const top = artists.slice(0, 3).map((a, i) => ({ ...a, rank: i + 1 }));
  if (!top.length) return null;
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top; // 2nd · 1st · 3rd
  const max = top[0].songs || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 20, paddingTop: 62, flexWrap: "wrap" }}>
      {order.map((a) => {
        const first = a.rank === 1;
        const medal = MEDAL[a.rank];
        const photo = first ? 116 : 88;
        return (
          <div key={a.artist} className="lift" style={{ flex: first ? "1 1 230px" : "1 1 188px", maxWidth: first ? 290 : 250, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", zIndex: 2, marginBottom: -(photo * 0.5) }}>
              <ArtistAvatar name={a.artist} size={photo} eager ring={`3px solid ${medal}`} />
            </div>
            <Card style={{ width: "100%", textAlign: "center", overflow: "visible", paddingTop: photo * 0.5 + 18, minHeight: first ? 172 : 142, border: `1.5px solid ${medal}`, background: MEDAL_WASH[a.rank], boxShadow: MEDAL_GLOW[a.rank] }}>
              <div style={{ fontFamily: FONT.display, fontSize: first ? 38 : 28, fontWeight: 800, color: medal, lineHeight: 1 }}>{String(a.rank).padStart(2, "0")}</div>
              <div style={{ fontFamily: FONT.ui, fontSize: first ? 19 : 16, fontWeight: 800, color: medal, marginTop: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.artist}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub, marginTop: 5 }}>{a.songs} songs</div>
              <div style={{ height: 5, background: C.border2, marginTop: 12 }}>
                <div style={{ height: 5, background: medal, width: `${(a.songs / max) * 100}%`, boxShadow: `0 0 8px ${medal}` }} />
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

const scrim = {
  position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 9px 7px",
  background: "linear-gradient(to top, rgba(0,0,0,0.86), rgba(0,0,0,0))",
};

// Measure the container so the mosaic can justify rows to its exact width.
function useMeasure() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Deterministic per-index pseudo-randoms (stable across renders) → organic, repeatable variety.
const _h1 = (i) => Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
const _h2 = (i) => Math.abs(Math.sin((i + 1) * 78.233) * 12543.137) % 1;

// True Pinterest-style masonry wall. Tiles flow into N columns at VARIED heights (tall ↔ short)
// and some span 2 columns (wide ↔ square); each tile drops into the lowest-available slot so the
// wall packs tight with no interior gaps. Footprints shrink by rank/plays — big heroes up top,
// small tiles toward the bottom — and rank still flows top→bottom (no random reordering).
function Mosaic({ items, render, gap = 10, minH = 132, maxH = 344 }) {
  const [ref, width] = useMeasure();
  const n = items.length;
  let placed = [], wallH = 320;
  if (width > 0) {
    const cols = width >= 1000 ? 5 : width >= 760 ? 4 : width >= 520 ? 3 : 2;
    const colW = (width - (cols - 1) * gap) / cols;
    const colH = new Array(cols).fill(0);
    placed = items.map((it, i) => {
      const rankT = n > 1 ? i / (n - 1) : 0;                       // 0 top → 1 bottom
      const base = maxH - Math.pow(rankT, 0.82) * (maxH - minH);   // steep shrink down the page
      const h = Math.round(Math.max(118, Math.min(372, base * (0.72 + _h1(i) * 0.72))));  // ±organic jitter
      let span = (cols >= 3 && (i < 2 || _h2(i) < 0.16)) ? 2 : 1;  // heroes + a sprinkle go double-wide
      span = Math.min(span, cols);
      // lowest slot that fits the span (leftmost on ties); track the height step it strands
      let bestP = 0, bestY = Infinity, bestStep = Infinity;
      for (let p = 0; p <= cols - span; p++) {
        let top = 0, bot = Infinity;
        for (let k = 0; k < span; k++) { top = Math.max(top, colH[p + k]); bot = Math.min(bot, colH[p + k]); }
        if (top < bestY - 0.5) { bestY = top; bestP = p; bestStep = top - bot; }
      }
      // a 2-wide tile that would sit on uneven columns leaves a gap under it — demote to 1-wide
      if (span === 2 && bestStep > 56) {
        span = 1; bestY = Infinity;
        for (let p = 0; p < cols; p++) if (colH[p] < bestY - 0.5) { bestY = colH[p]; bestP = p; }
      }
      const w = span * colW + (span - 1) * gap;
      for (let k = 0; k < span; k++) colH[bestP + k] = bestY + h + gap;
      return { it, i, x: bestP * (colW + gap), y: bestY, w, h };
    });
    wallH = Math.max(...colH) - gap;
  }
  return (
    <div ref={ref} style={{ position: "relative", height: width ? wallH : 320 }}>
      {placed.map(({ it, i, x, y, w, h }) => (
        <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
          {render(it, i, h, w)}
        </div>
      ))}
    </div>
  );
}

function ArtistTile({ a, rank, big, delay }) {
  return (
    <div className="pop-in lift" style={{ width: "100%", height: "100%", position: "relative", borderRadius: 4, overflow: "hidden", background: C.card2, border: `1px solid ${C.border2}`, animationDelay: `${delay}ms` }}>
      <ArtistAvatar name={a.artist} fill radius={0} />
      <span style={{ position: "absolute", top: 7, left: 9, fontFamily: FONT.display, fontSize: big ? 18 : 14, fontWeight: 800, color: "#fff", textShadow: "0 1px 5px rgba(0,0,0,0.9)", fontVariantNumeric: "tabular-nums" }}>{String(rank).padStart(2, "0")}</span>
      <div style={scrim}>
        <div style={{ fontFamily: FONT.ui, fontSize: big ? 14.5 : 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.artist}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, color: "#dcdcdc", marginTop: 1 }}>{a.songs} songs</div>
      </div>
    </div>
  );
}

function AlbumTile({ al, big, delay }) {
  const initial = ((al.album || "?").trim()[0] || "?").toUpperCase();
  return (
    <div className="pop-in" style={{ width: "100%", height: "100%", position: "relative", borderRadius: 4, overflow: "hidden", background: C.card2, border: `1.5px solid ${C.ink}`, animationDelay: `${delay}ms` }}>
      {al.cover ? (
        <img src={al.cover} alt={al.album} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontSize: big ? 52 : 30, fontWeight: 800, color: C.faint }}>{initial}</div>
      )}
      {al.listen_session && (
        <div title={`Best run ${al.listen_session.run} tracks · ${al.listen_session.date}`} style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 3, background: AC }}>
          <span style={{ color: "#fff", fontSize: 9 }}>▶</span>
          {big && <span style={{ fontFamily: FONT.mono, color: "#fff", letterSpacing: "0.5px", fontSize: 9, fontWeight: 700 }}>IN FULL</span>}
        </div>
      )}
      <div style={scrim}>
        <div style={{ fontFamily: FONT.ui, fontSize: big ? 13 : 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.album}</div>
        {big && <div style={{ fontSize: 10, color: "#dcdcdc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.artist}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.28)" }}>
            <div style={{ height: 3, background: AC, width: `${Math.round((al.completion ?? 0) * 100)}%` }} />
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: "#dcdcdc", fontVariantNumeric: "tabular-nums" }}>{al.total_tracks ? `${al.owned}/${al.total_tracks}` : al.owned}</span>
        </div>
      </div>
    </div>
  );
}

const chartTab = (active) => ({
  padding: "8px 16px", borderRadius: 4, border: "none", cursor: "pointer",
  fontSize: 12.5, fontWeight: 700, fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.04em",
  background: active ? C.ink : "transparent", color: active ? C.bg : C.ink,
});

function Charts({ artists, albums }) {
  const [tab, setTab] = useState("artists");
  if (!artists || !albums) {
    return <div style={{ ...TYPE.body, padding: "40px 0" }}>Loading your charts…</div>;
  }
  const rest = artists.slice(3);
  return (
    <Reveal>
      <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "transparent", border: `1.5px solid ${C.ink}`, borderRadius: 6, marginBottom: 28 }}>
        <button onClick={() => setTab("artists")} style={chartTab(tab === "artists")}>Top Artists</button>
        <button onClick={() => setTab("albums")} style={chartTab(tab === "albums")}>Top Albums</button>
      </div>

      {tab === "artists" ? (
        <>
          <Department no="—" title="Top Artists" right={<span style={{ ...TYPE.micro, color: C.muted }}>sized by songs saved</span>} />
          <Podium artists={artists} />
          {rest.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <Mosaic items={rest}
                render={(a, i, h, w) => <ArtistTile key={a.artist} a={a} rank={i + 4} big={h >= 210 || w >= 300} delay={Math.min(i * 14, 380)} />} />
            </div>
          )}
        </>
      ) : (
        <>
          <Department no="—" title="Top Albums" right={<span style={{ ...TYPE.micro, color: C.muted }}>sized by songs saved · ▶ played in full</span>} />
          {albums.length === 0 ? (
            <EmptyState title="No albums yet" hint="Save more tracks to build your album charts." />
          ) : (
            <Mosaic items={albums}
              render={(al, i, h, w) => <AlbumTile key={`${al.album}-${al.artist}`} al={al} big={h >= 200 || w >= 300} delay={Math.min(i * 14, 380)} />} />
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
    fetch(`${API}/stats/top-albums-rich?limit=50`).then((r) => r.json()).then((d) => setTopAlbums(d.albums || []));
  }, [view, topArtists]);

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`).then((r) => r.json()).then(setSonic);
    fetch(`${API}/stats/all-time`).then((r) => r.json()).then(setAllTime);
    fetch(`${API}/playlists/languages`).then((r) => r.json()).then((d) => setLanguages(d.languages || []));
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

  const { averages, mood_distribution, energy_distribution, signature_mood, peak_year, peak_year_count, artist_count, decade_distribution } = sonic;
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

  const hrs = Math.floor((wrapped?.total_minutes || 0) / 60);
  const mins = Math.round((wrapped?.total_minutes || 0) % 60);
  const clockMax = Math.max(...(wrapped?.listening_clock?.map((h) => h.plays) || [0])) || 1;

  // Custom masthead tag (white-outline, for the saturated cover band).
  const heroTag = (active) => ({
    padding: "8px 15px", borderRadius: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer",
    border: `1.5px solid ${C.ink2}`, transition: "all 0.15s",
    background: active ? C.ink2 : "rgba(255,255,255,0.14)", color: active ? "#fff" : C.ink2,
  });

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>
      <Masthead
        no="01" section="Identity" title="Identity"
        actions={<>
          <button style={heroTag(view === "fingerprint")} onClick={() => setView("fingerprint")}>Fingerprint</button>
          <button style={heroTag(view === "charts")} onClick={() => setView("charts")}>Charts</button>
        </>}
        lede={<>What your <b style={{ fontWeight: 800 }}>{averages.total_analyzed.toLocaleString()}</b> analyzed songs says about you</>}
      />

      {/* Stat strip — white card overlapping the band edge (magazine cover layering) */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
        <Card style={{ marginTop: -34, border: `1px solid ${C.border2}`, boxShadow: "0 14px 40px rgba(0,0,0,0.5)", padding: "28px 30px", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "26px 44px" }}>
            <StatBlock value={Math.round(averages.tempo)} label="Avg BPM" format={(n) => Math.round(n)} valueStyle={STRIP_NUM} />
            <StatBlock value={groove} label="Groove" format={pct} valueStyle={STRIP_NUM}
              info="How much your library makes you move. It blends danceability (is there a beat to lock into?) with energy (does it actually hit?). Higher leans dancefloor; lower leans headphones-on-the-couch." />
            <StatBlock value={signature_mood || "—"} label="Signature Mood" accent={AC} valueStyle={STRIP_WORD}
              info="Every saved track gets tagged with niche moods (euphoric, melancholy, menacing, and friends). Your signature is simply the one that shows up most — the vibe your library reaches for more than any other." />
            <StatBlock value={peak_year ? String(peak_year) : "—"} label="Peak Year" valueStyle={STRIP_NUM}
              info={<>The release year your taste leans on hardest{peak_year_count ? <> — <b style={{ color: C.ink }}>{peak_year_count.toLocaleString()}</b> of your songs came out in {peak_year}</> : ""}, more than any other year. It's about when the music was made, not when you saved it.</>} />

            <StatBlock value={artist_count || 0} label="Artists" format={(n) => Math.round(n).toLocaleString()} valueStyle={STRIP_NUM} />
          </div>
        </Card>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 24px 64px" }}>
        {view === "fingerprint" && (<>
        {/* Fingerprint */}
        <Reveal>
          <Department no="—" title="Fingerprint" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 20, marginBottom: 40 }}>
            {(() => {
              const moodParts = [
                { name: "dark", value: mood_distribution.dark, color: C.indigo },
                { name: "neutral", value: mood_distribution.neutral, color: C.violet },
                { name: "happy", value: mood_distribution.happy, color: C.green },
              ];
              const energyParts = [
                { name: "calm", value: energy_distribution.calm, color: C.blue },
                { name: "medium", value: energy_distribution.medium, color: C.amber },
                { name: "intense", value: energy_distribution.intense, color: C.red },
              ];
              const langParts = buildLangParts(languages);
              const decadeParts = (decade_distribution || []).map((d, i) => ({
                name: `${d.decade}s`, value: d.count, color: SERIES[i % SERIES.length],
              }));
              const mTop = topPart(moodParts), eTop = topPart(energyParts), dTop = topPart(decadeParts);
              const hdr = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 };
              return (<>
                {/* Audio Profile — radar grows to fill the card */}
                <Card className="lift" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={hdr}>
                    <div style={{ ...TYPE.micro }}>Audio Profile</div>
                    <InfoTip title="Audio Profile">{audioReading(averages)}</InfoTip>
                  </div>
                  <div style={{ flex: 1, minHeight: 248, display: "flex" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} outerRadius="72%">
                        <PolarGrid stroke={C.border2} />
                        <PolarAngleAxis dataKey="feature" tick={{ ...axisTick, fill: C.sub }} />
                        <Radar dataKey="value" stroke={AC} fill={AC} fillOpacity={0.18} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ ...chromeText, fontFamily: FONT.display, fontWeight: 800, fontStretch: "125%", fontSize: "clamp(22px,2.6vw,34px)", lineHeight: 1, textAlign: "center", marginTop: 8 }}>{headline}</div>
                </Card>

                {/* Distributions — mood · energy · language donuts */}
                <Card className="lift" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={hdr}>
                    <div style={{ ...TYPE.micro }}>Distributions</div>
                    <InfoTip title="Mood · Energy · Language">{moodReading(mood_distribution)} {energyReading(energy_distribution)} {langReading(languages)}</InfoTip>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly", gap: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, justifyItems: "center" }}>
                      <div>
                        <div style={{ ...TYPE.micro, textAlign: "center", marginBottom: 10 }}>Mood</div>
                        <Donut parts={moodParts} centerTop={mTop.name} centerSub={`${mTop.pct}%`} size={124} />
                      </div>
                      <div>
                        <div style={{ ...TYPE.micro, textAlign: "center", marginBottom: 10 }}>Energy</div>
                        <Donut parts={energyParts} centerTop={eTop.name} centerSub={`${eTop.pct}%`} size={124} />
                      </div>
                    </div>
                    <div>
                      <div style={{ ...TYPE.micro, textAlign: "center", marginBottom: 10 }}>Language</div>
                      {languages
                        ? <Donut parts={langParts} centerTop={langParts.length} centerSub="languages" size={124} />
                        : <div style={{ ...TYPE.body, fontSize: 12, textAlign: "center" }}>Loading…</div>}
                    </div>
                  </div>
                </Card>

                {/* Eras — decade donut, centered */}
                <Card className="lift" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={hdr}>
                    <div style={{ ...TYPE.micro }}>Eras</div>
                    <InfoTip title="Eras">The release-year span of your library by decade. Your center of gravity is the {dTop.name} ({dTop.pct}% of saves) — where your taste lives.</InfoTip>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
                    {decadeParts.length
                      ? (<>
                        <Donut parts={decadeParts} centerTop={dTop.name} centerSub={`${dTop.pct}%`} size={184} />
                        <div style={{ ...TYPE.body, fontSize: 13, textAlign: "center" }}>
                          Your taste lives in the <b style={{ color: C.ink }}>{dTop.name}</b>.
                        </div>
                      </>)
                      : <div style={{ ...TYPE.body, fontSize: 12 }}>Not enough release-year data yet.</div>}
                  </div>
                </Card>
              </>);
            })()}
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
                <StatBlock value={wrapped.top_artists?.[0]?.artist || "—"} label="Top Artist" valueStyle={{ fontSize: "clamp(18px,2.3vw,26px)", whiteSpace: "normal", overflow: "visible", textOverflow: "clip", lineHeight: 1.1 }} />
                <StatBlock value={wrapped.top_songs?.[0]?.track || "—"} label="Top Song" valueStyle={{ fontSize: "clamp(18px,2.3vw,26px)", whiteSpace: "normal", overflow: "visible", textOverflow: "clip", lineHeight: 1.1 }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 20 }}>
                <Card className="lift">
                  <div style={{ ...TYPE.micro, marginBottom: 18 }}>Top Artists</div>
                  {wrapped.top_artists?.length ? (
                    wrapped.top_artists.map((a, i) => (
                      <RankRow key={a.artist} i={i} title={a.artist} right={`${a.plays} plays`} bar={(a.plays / (wrapped.top_artists[0]?.plays || 1)) * 100} accent={AC} />
                    ))
                  ) : (
                    <EmptyState title="No listening history yet" hint="Keep the poller running and your top artists appear here." />
                  )}
                </Card>
                <Card className="lift">
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
                      <Tooltip formatter={(v) => [`${v} plays`, "Plays"]} labelFormatter={(h) => `${h}:00`} contentStyle={chartTooltip} itemStyle={{ color: C.ink }} labelStyle={{ color: C.silver }} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                      <Bar dataKey="plays" radius={[2, 2, 0, 0]}>
                        {wrapped.listening_clock.map((entry, i) => (
                          <Cell key={i} fill={entry.plays > 0 ? AC : C.faint} opacity={entry.plays > 0 ? 0.45 + (entry.plays / clockMax) * 0.55 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {allTime && (
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", padding: "4px 2px", fontFamily: FONT.mono, fontSize: 12, color: C.sub }}>
                  <span>Total plays ever <b style={{ color: C.ink }}>{allTime.total_plays?.toLocaleString()}</b></span>
                  <span>Hours ever <b style={{ color: C.ink }}>{allTime.estimated_hours}h</b></span>
                  <span>Tracking since <b style={{ color: C.ink }}>{allTime.tracking_since}</b></span>
                  <span>All-time #1 <b style={{ color: AC }}>{allTime.top_artists_all_time?.[0]?.artist || "—"}</b></span>
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
