import { C, FONT, TYPE, chromeText, metalHeadline } from "../theme";

// Department masthead — a BOLD color block (the section's jewel color), with a
// chrome + black-outline magazine headline and a gunmetal-silver kicker. The
// section color comes from --accent (set on the page root), so each tab is distinct.
export default function Masthead({ no, section, title, lede, actions, titleFont }) {
  return (
    <div className="jewel-sheen" style={{
      position: "relative", overflow: "hidden", isolation: "isolate",
      background: `linear-gradient(155deg, ${C.accent} 0%, rgba(0,0,0,0.30) 155%)`,
      borderBottom: `2px solid ${C.ink2}`,
      boxShadow: "inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -3px 8px rgba(0,0,0,0.32)",
    }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "clamp(26px,4.5vw,44px) 24px clamp(28px,4.5vw,44px)", position: "relative" }}>
        {/* kicker row — oversized folio number, rule, spinning ✦ (section name lives in the title below) */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, color: "#fff", flexShrink: 0, lineHeight: 0.82 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.02em", marginTop: 4, opacity: 0.85 }}>Nº</span>
            <span style={{ fontFamily: FONT.display, fontWeight: 800, fontStretch: "125%", fontSize: "clamp(38px,5vw,58px)", letterSpacing: "-0.03em" }}>{no}</span>
          </div>
          <div style={{ flex: 1, height: 2, background: C.ink2, opacity: 0.45, minWidth: 20 }} />
          <span className="spin-slow" aria-hidden style={{ ...chromeText, fontSize: 22, lineHeight: 1, flexShrink: 0, display: "inline-block" }}>✦</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <h1 style={{ ...TYPE.hero, ...metalHeadline, fontFamily: titleFont || FONT.head, fontStretch: "normal", letterSpacing: "0.01em", margin: 0 }}>{title}</h1>
          {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </div>
        {lede && <p style={{ fontFamily: FONT.lede, fontWeight: 600, fontSize: 15.5, lineHeight: 1.45, letterSpacing: "0", color: C.accentInk, opacity: 0.95, marginTop: 18, maxWidth: 680 }}>{lede}</p>}
      </div>
    </div>
  );
}
