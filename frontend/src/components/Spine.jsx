import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { C, FONT, TYPE } from "../theme";
import useMediaQuery from "../hooks/useMediaQuery";

export const SIDEBAR = 232;
export const MOBILE_Q = "(max-width: 860px)";

// The five magazine sections (single source of truth for nav).
export const SECTIONS = [
  { n: "01", to: "/",           label: "Identity",   dek: "fingerprint + live wrapped" },
  { n: "02", to: "/collection", label: "Collection", dek: "11,770 songs, browsable" },
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
      <div style={{ fontFamily: FONT.display, fontSize: size, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em" }}>
        FIDOLIO
      </div>
    </Link>
  );
}

// ---- Desktop: fixed vertical "spine" contents column ----
function DesktopSpine({ pathname }) {
  return (
    <aside
      style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width: SIDEBAR, zIndex: 200,
        borderRight: `1px solid ${C.border}`, background: C.bg,
        padding: "30px 24px", display: "flex", flexDirection: "column",
      }}
    >
      <Wordmark />
      <div style={{ ...TYPE.micro, color: C.green, marginTop: 10 }}>{issueLine()}</div>

      <nav style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 4 }}>
        {SECTIONS.map((s) => {
          const active = isActive(pathname, s.to);
          return (
            <Link
              key={s.to}
              to={s.to}
              className={active ? undefined : "spine-link"}
              style={{
                textDecoration: "none", display: "block",
                padding: "11px 0 11px 14px",
                borderLeft: `2px solid ${active ? C.green : "transparent"}`,
                color: active ? "#fff" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span style={{ fontFamily: FONT.display, fontSize: 12, fontWeight: 700, color: active ? C.green : C.faint, fontVariantNumeric: "tabular-nums" }}>
                  {s.n}
                </span>
                <span style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "inherit" }}>
                  {s.label}
                </span>
              </div>
              {active && <div style={{ ...TYPE.micro, color: C.muted, marginTop: 4, marginLeft: 21 }}>{s.dek}</div>}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", ...TYPE.micro, color: C.faint, lineHeight: 1.6 }}>
        A library,<br />read as a magazine.
      </div>
    </aside>
  );
}

// ---- Mobile: slim top bar + full-screen index overlay ----
function MobileSpine({ pathname }) {
  const [open, setOpen] = useState(false);
  const current = SECTIONS.find((s) => isActive(pathname, s.to));

  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 52, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 18px", borderBottom: `1px solid ${C.border}`,
          background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <Wordmark size={18} />
          {current && <span style={{ ...TYPE.micro, color: C.muted }}>{current.label}</span>}
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open contents"
          style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 6 }}
        >
          ☰
        </button>
      </header>

      {open && (
        <div
          className="fade-in"
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(8,8,8,0.98)", backdropFilter: "blur(8px)",
            padding: "26px 24px", overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Wordmark />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close contents"
              style={{ background: "none", border: "none", color: C.sub, fontSize: 30, cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ ...TYPE.micro, color: C.green, marginBottom: 30 }}>{issueLine()} · CONTENTS</div>

          <nav style={{ display: "flex", flexDirection: "column" }}>
            {SECTIONS.map((s) => {
              const active = isActive(pathname, s.to);
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  onClick={() => setOpen(false)}
                  style={{ textDecoration: "none", padding: "18px 0", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 14 }}
                >
                  <span style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 700, color: active ? C.green : C.faint, fontVariantNumeric: "tabular-nums" }}>
                    {s.n}
                  </span>
                  <span>
                    <span style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: active ? "#fff" : C.sub, display: "block" }}>
                      {s.label}
                    </span>
                    <span style={{ ...TYPE.micro, color: C.muted, marginTop: 4, display: "block" }}>{s.dek}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

export default function Spine() {
  const { pathname } = useLocation();
  const isMobile = useMediaQuery(MOBILE_Q);
  // Close any mobile overlay implicitly by remounting on route change is handled inside.
  useEffect(() => {}, [pathname]);
  return isMobile ? <MobileSpine pathname={pathname} /> : <DesktopSpine pathname={pathname} />;
}
