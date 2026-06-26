import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { C, FONT, TYPE, SECTION, discoText, SIDEBAR, MOBILE_Q } from "../theme";
import useMediaQuery from "../hooks/useMediaQuery";
import NowPlaying from "./NowPlaying";
import { useAuth } from "../context/AuthProvider";

// Re-export so existing imports (App, Playlists) keep working.
export { SIDEBAR, MOBILE_Q };

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// The five magazine sections (single source of truth for nav).
export const SECTIONS = [
  { n: "01", to: "/",           label: "Identity",   dek: "fingerprint + wrapped" },
  { n: "02", to: "/collection", label: "Collection", dek: "browse your whole library" },
  { n: "03", to: "/discover",   label: "Discover",   dek: "search · vibes · albums" },
  { n: "04", to: "/timeline",   label: "Rewind",     dek: "eras + monthly rewind" },
  { n: "05", to: "/playlists",  label: "Playlists",  dek: "builder + collab rooms" },
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function issueLine() {
  const d = new Date();
  return `Nº ${String(d.getMonth() + 1).padStart(2, "0")} · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function isActive(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

// Green Spotify-shade disco ball, drawn in code (no image): a shaded green sphere with
// drifting mirror facets, twinkling specular glints, and a sparkle. Looks like a logo.
function DiscoBall({ size = 32 }) {
  const tile = Math.max(3, Math.round(size / 7));
  const glint = (top, left, d, delay) => (
    <span className="disco-twinkle" style={{ position: "absolute", top, left, width: d, height: d, borderRadius: "50%", background: "radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)", animationDelay: delay }} />
  );
  return (
    <span aria-hidden style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
      {/* circular clip: green sphere + faceted mirror tiles + glints */}
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden",
        border: "1px solid rgba(4,40,18,0.85)",
        boxShadow: "inset -3px -5px 9px rgba(0,0,0,0.6), inset 3px 3px 7px rgba(255,255,255,0.45), 0 0 18px rgba(29,185,84,0.8), 0 0 5px rgba(120,255,170,0.9)",
      }}>
        <span style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 34% 26%, #d8ffe6 0%, #5bff97 22%, #1DB954 52%, #0a6a30 80%, #05401d 100%)" }} />
        <span className="disco-facets" style={{
          position: "absolute", inset: "-25%", mixBlendMode: "overlay",
          backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.42) 0 1px, transparent 1px ${tile}px), repeating-linear-gradient(90deg, rgba(0,0,0,0.42) 0 1px, transparent 1px ${tile}px), repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 1px, transparent 1px ${tile * 2}px)`,
        }} />
        {glint("22%", "28%", size * 0.18, "0s")}
        {glint("54%", "60%", size * 0.13, "0.6s")}
        {glint("64%", "30%", size * 0.10, "1.1s")}
        {glint("38%", "72%", size * 0.11, "1.7s")}
      </span>
      {/* sparkle star overhanging the rim */}
      <span className="disco-twinkle" style={{ position: "absolute", top: "-12%", right: "-10%", color: "#eafff0", fontSize: size * 0.42, lineHeight: 1, textShadow: "0 0 6px #6dffa0", animationDelay: "0.3s" }}>✦</span>
    </span>
  );
}

// Green disco-ball wordmark — sparkly ball + shimmering FIDOLIO that fills the sidebar.
function Wordmark({ size = 34 }) {
  return (
    <Link to="/" style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.24), textDecoration: "none", width: "100%", overflow: "visible" }}>
      <DiscoBall size={Math.round(size * 0.98)} />
      <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontSize: size, fontStyle: "italic", letterSpacing: "-0.05em", lineHeight: 0.95, whiteSpace: "nowrap", paddingRight: Math.round(size * 0.16), ...discoText }}>FIDOLIO</div>
    </Link>
  );
}

// ---- Desktop: fixed vertical "spine" — collapsible, with Now Playing at its foot ----
const ROWH = 48; // uniform tab height — lets the indicator band slide cleanly between tabs
function DesktopSpine({ pathname, sections, collapsed, onToggle }) {
  const auth = useAuth();
  // Active tab + travel direction (drives which way the sword sheen skews).
  const activeIndex = sections.findIndex((s) => isActive(pathname, s.to));
  const idx = activeIndex < 0 ? 0 : activeIndex;
  const prevIndex = useRef(idx);
  const dir = idx >= prevIndex.current ? "down" : "up";
  useEffect(() => { prevIndex.current = idx; }, [idx]);
  const activeSc = SECTION[idx + 1];

  return (
    <>
      <aside
        style={{
          position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 200,
          width: collapsed ? 0 : SIDEBAR,
          // Fat gunmetal seam between the spine and the page (replaces the old edge EQ rail).
          borderRight: collapsed ? "none" : "4px solid rgba(190,196,206,0.20)",
          boxShadow: collapsed ? "none" : "inset -1px 0 0 rgba(0,0,0,0.5)",
          background: C.bg,
          display: "flex", flexDirection: "column", overflow: "hidden",
          transition: "width 0.44s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div style={{ padding: "22px 16px 0", flexShrink: 0 }}>
          <Wordmark />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 11 }}>
            <div style={{ ...TYPE.micro, color: C.silver, whiteSpace: "nowrap", letterSpacing: "2.5px" }}>high fidelity</div>
            <button onClick={onToggle} aria-label="Collapse sidebar" title="Collapse"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border2}`, borderRadius: 4, width: 24, height: 24, color: C.silver, cursor: "pointer", fontSize: 12, lineHeight: 1, flexShrink: 0 }}>«</button>
          </div>
          {auth?.user ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.border2}` }}>
              <span style={{ ...TYPE.micro, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "none", letterSpacing: 0 }} title={auth.user.display_name}>{auth.user.display_name}</span>
              <button onClick={auth.logout} title="Log out"
                style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: 4, color: C.silver, cursor: "pointer", fontSize: 9.5, fontFamily: FONT.mono, letterSpacing: "0.06em", padding: "3px 8px", textTransform: "uppercase", flexShrink: 0 }}>Log out</button>
            </div>
          ) : auth?.isGuest ? (
            <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.border2}` }}>
              <button onClick={auth.login} title="Log in with Spotify"
                style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#1DB954", color: "#0B0C0F", border: "none", borderRadius: 6, padding: "9px 10px", fontFamily: FONT.ui, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Log in with Spotify</button>
            </div>
          ) : null}
        </div>

        {/* Edge-to-edge tabs: one full-bleed band slides to the active tab; a sharp sword gleam + a glitch/scanline pop fire as it lands. */}
        <nav style={{ position: "relative", marginTop: 20, flexShrink: 0 }}>
          {activeIndex >= 0 && (
            <div aria-hidden style={{
              position: "absolute", left: 0, right: 0, top: idx * ROWH, height: ROWH,
              background: activeSc.color, overflow: "hidden", zIndex: 0,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 7px rgba(0,0,0,0.30)",
              transition: "top 0.46s cubic-bezier(0.83,0,0.17,1), background-color 0.3s ease",
            }}>
              <span key={pathname + "-pop"} className="tab-pop" />
              <span key={pathname} className={`nav-sword nav-sword-${dir}`} />
            </div>
          )}
          {sections.map((s, i) => {
            const active = i === activeIndex;
            const c = SECTION[i + 1];
            // Active text waits for the band to arrive before flipping to its on-color; outgoing flips back instantly.
            const tleave = { transition: "color 0.25s ease, background 0.25s ease", transitionDelay: active ? "0.30s" : "0s" };
            return (
              <Link key={s.to} to={s.to} className="nav-row" style={{
                position: "relative", zIndex: 1, textDecoration: "none",
                height: ROWH, display: "flex", alignItems: "center", gap: 11, padding: "0 14px 0 16px",
              }}>
                <span style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  background: active
                    ? "radial-gradient(circle at 33% 27%, #ffffff 0%, #d2d7df 44%, #8b92a0 100%)"
                    : `radial-gradient(circle at 33% 27%, #ffffff 0%, ${c.color} 46%, ${c.color} 100%)`,
                  boxShadow: active
                    ? "inset 0 -2px 3px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.7), 0 0 5px rgba(255,255,255,0.45)"
                    : `inset 0 -2px 3px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.6), 0 0 6px ${c.color}66`,
                  ...tleave,
                }} />
                <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: active ? c.on : c.color, ...tleave }}>{s.n}</span>
                <span className="tab-glow" style={{ fontFamily: FONT.tab, fontWeight: 700, fontSize: 22.5, letterSpacing: "0.02em", color: active ? c.on : C.ink, animationDelay: `${i * 0.7}s`, ...tleave }}>{s.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Contextual caption for the active section (replaces the per-tab dek for a cleaner column). */}
        <div style={{ ...TYPE.micro, color: C.muted, padding: "9px 16px 0", flexShrink: 0, minHeight: 14 }}>
          {activeIndex >= 0 ? sections[idx]?.dek : ""}
        </div>

        {/* Now Playing lives at the foot of the spine */}
        <div style={{ flex: 1, minHeight: 0, paddingTop: 18, display: "flex", flexDirection: "column" }}>
          <NowPlaying variant="panel" />
        </div>
      </aside>

      {collapsed && (
        <button onClick={onToggle} aria-label="Open sidebar" title="Open menu"
          style={{ position: "fixed", top: 16, left: 16, zIndex: 250, width: 40, height: 40, borderRadius: 6, border: `1.5px solid ${C.ink}`, background: C.card, color: C.ink, fontSize: 18, cursor: "pointer", boxShadow: "3px 3px 0 rgba(22,17,24,0.16)" }}>☰</button>
      )}
    </>
  );
}

// ---- Mobile: slim top bar + full-screen index overlay + bottom Now Playing bar ----
function MobileSpine({ pathname, sections }) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const current = sections.find((s) => isActive(pathname, s.to));

  return (
    <>
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 52, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", borderBottom: `1.5px solid ${C.ink}`, background: "rgba(241,236,224,0.95)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <Wordmark size={19} />
          {current && <span style={{ ...TYPE.micro, color: C.muted }}>{current.label}</span>}
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open contents" style={{ background: "none", border: "none", color: C.ink, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 6 }}>☰</button>
      </header>

      {open && (
        <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(241,236,224,0.98)", backdropFilter: "blur(8px)", padding: "26px 24px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Wordmark />
            <button onClick={() => setOpen(false)} aria-label="Close contents" style={{ background: "none", border: "none", color: C.ink, fontSize: 30, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ ...TYPE.micro, color: C.muted, marginBottom: 26 }}>{issueLine()} · CONTENTS</div>
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {sections.map((s, i) => {
              const active = isActive(pathname, s.to);
              const sc = SECTION[i + 1];
              return (
                <Link key={s.to} to={s.to} onClick={() => setOpen(false)} style={{ textDecoration: "none", padding: "18px 0", borderTop: `1.5px solid ${C.ink}`, display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 700, color: sc.color, fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
                  <span>
                    <span style={{ fontFamily: FONT.tab, fontWeight: 400, fontSize: 28, letterSpacing: "0.02em", color: active ? sc.color : C.ink, display: "block" }}>{s.label}</span>
                    <span style={{ ...TYPE.micro, color: C.muted, marginTop: 4, display: "block" }}>{s.dek}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          {auth?.user ? (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1.5px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ ...TYPE.micro, color: C.muted }}>{auth.user.display_name}</span>
              <button onClick={() => { setOpen(false); auth.logout(); }}
                style={{ background: "none", border: `1.5px solid ${C.ink}`, borderRadius: 4, color: C.ink, cursor: "pointer", fontSize: 12, fontFamily: FONT.mono, fontWeight: 700, letterSpacing: "0.06em", padding: "8px 14px", textTransform: "uppercase" }}>Log out</button>
            </div>
          ) : auth?.isGuest ? (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1.5px solid ${C.ink}` }}>
              <button onClick={() => { setOpen(false); auth.login(); }}
                style={{ width: "100%", background: "#1DB954", border: "none", borderRadius: 6, color: "#0B0C0F", cursor: "pointer", fontSize: 13, fontFamily: FONT.ui, fontWeight: 800, padding: "12px 14px" }}>Log in with Spotify</button>
            </div>
          ) : null}
        </div>
      )}

      <NowPlaying variant="bar" />
    </>
  );
}

export default function Spine({ collapsed = false, onToggle = () => {} }) {
  const { pathname } = useLocation();
  const isMobile = useMediaQuery(MOBILE_Q);
  const [total, setTotal] = useState(null);

  // Live library size — same source as the Collection page, so they always match.
  useEffect(() => {
    let alive = true;
    fetch(`${API}/library/liked-songs?limit=1`)
      .then((r) => r.json())
      .then((d) => { if (alive && typeof d.total === "number") setTotal(d.total); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const sections = total == null
    ? SECTIONS
    : SECTIONS.map((s) => (s.to === "/collection" ? { ...s, dek: `${total.toLocaleString()} songs, browsable` } : s));

  return isMobile
    ? <MobileSpine pathname={pathname} sections={sections} />
    : <DesktopSpine pathname={pathname} sections={sections} collapsed={collapsed} onToggle={onToggle} />;
}
