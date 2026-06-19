import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { C, FONT, TYPE, SIDEBAR, MOBILE_Q } from "../theme";
import useMediaQuery from "../hooks/useMediaQuery";
import NowPlaying from "./NowPlaying";

// Re-export so existing imports (App, Playlists) keep working.
export { SIDEBAR, MOBILE_Q };

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// The five magazine sections (single source of truth for nav).
export const SECTIONS = [
  { n: "01", to: "/",           label: "Identity",   dek: "fingerprint + live wrapped" },
  { n: "02", to: "/collection", label: "Collection", dek: "browse your whole library" },
  { n: "03", to: "/discover",   label: "Discover",   dek: "search · vibes · albums" },
  { n: "04", to: "/timeline",   label: "Timeline",   dek: "eras + monthly rewind" },
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

function Wordmark({ size = 22 }) {
  return (
    <Link to="/" style={{ textDecoration: "none" }}>
      <div style={{ fontFamily: FONT.display, fontSize: size, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em" }}>FIDOLIO</div>
    </Link>
  );
}

// ---- Desktop: fixed vertical "spine" — collapsible, with Now Playing at its foot ----
function DesktopSpine({ pathname, sections, collapsed, onToggle }) {
  return (
    <>
      <aside
        style={{
          position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 200,
          width: collapsed ? 0 : SIDEBAR,
          borderRight: collapsed ? "none" : `1px solid ${C.border}`, background: C.bg,
          display: "flex", flexDirection: "column", overflow: "hidden",
          transition: "width 0.3s ease",
        }}
      >
        <div style={{ padding: "26px 22px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <Wordmark />
              <div style={{ ...TYPE.micro, color: C.green, marginTop: 10, whiteSpace: "nowrap" }}>{issueLine()}</div>
            </div>
            <button onClick={onToggle} aria-label="Collapse sidebar" title="Collapse"
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, width: 26, height: 26, color: C.sub, cursor: "pointer", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>«</button>
          </div>
        </div>

        <nav style={{ marginTop: 34, padding: "0 22px", display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto", minHeight: 0 }}>
          {sections.map((s) => {
            const active = isActive(pathname, s.to);
            return (
              <Link key={s.to} to={s.to} className={active ? undefined : "spine-link"}
                style={{ textDecoration: "none", display: "block", padding: "10px 0 10px 14px", borderLeft: `2px solid ${active ? C.green : "transparent"}`, color: active ? "#fff" : undefined }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                  <span style={{ fontFamily: FONT.display, fontSize: 12, fontWeight: 700, color: active ? C.green : C.faint, fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
                  <span style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "inherit" }}>{s.label}</span>
                </div>
                {active && <div style={{ ...TYPE.micro, color: C.muted, marginTop: 4, marginLeft: 21 }}>{s.dek}</div>}
              </Link>
            );
          })}
        </nav>

        {/* Now Playing lives at the foot of the spine */}
        <NowPlaying variant="panel" />
      </aside>

      {collapsed && (
        <button onClick={onToggle} aria-label="Open sidebar" title="Open menu"
          style={{ position: "fixed", top: 16, left: 16, zIndex: 250, width: 40, height: 40, borderRadius: 11, border: `1px solid ${C.border}`, background: "rgba(8,8,8,0.92)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 18, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>☰</button>
      )}
    </>
  );
}

// ---- Mobile: slim top bar + full-screen index overlay + bottom Now Playing bar ----
function MobileSpine({ pathname, sections }) {
  const [open, setOpen] = useState(false);
  const current = sections.find((s) => isActive(pathname, s.to));

  return (
    <>
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 52, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <Wordmark size={18} />
          {current && <span style={{ ...TYPE.micro, color: C.muted }}>{current.label}</span>}
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open contents" style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 6 }}>☰</button>
      </header>

      {open && (
        <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(8,8,8,0.98)", backdropFilter: "blur(8px)", padding: "26px 24px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Wordmark />
            <button onClick={() => setOpen(false)} aria-label="Close contents" style={{ background: "none", border: "none", color: C.sub, fontSize: 30, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ ...TYPE.micro, color: C.green, marginBottom: 30 }}>{issueLine()} · CONTENTS</div>
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {sections.map((s) => {
              const active = isActive(pathname, s.to);
              return (
                <Link key={s.to} to={s.to} onClick={() => setOpen(false)} style={{ textDecoration: "none", padding: "18px 0", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 700, color: active ? C.green : C.faint, fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
                  <span>
                    <span style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: active ? "#fff" : C.sub, display: "block" }}>{s.label}</span>
                    <span style={{ ...TYPE.micro, color: C.muted, marginTop: 4, display: "block" }}>{s.dek}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
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
