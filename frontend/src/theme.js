// Fidolio design system — single source of truth.
// Aesthetic: "Editorial Wrapped" — art-directed, magazine-like, on a dark base.
// Promoted from the C-token + helper pattern used in Playlists.jsx / Collab.jsx.

export const C = {
  bg:      "#080808", // page background
  card:    "#0e0e0e", // card background
  card2:   "#111111", // input / secondary surface
  border:  "#1a1a1a", // default border
  border2: "#222222",
  green:   "#1db954", // primary accent (Spotify green)
  greenBg: "#0d2b18", // selected / active tint
  greenBd: "#1a4a2a", // highlighted card border
  amber:   "#f59e0b", // neutral mood / warnings
  amberBg: "#1a1200",
  indigo:  "#6366f1", // dark / sad mood
  violet:  "#8b5cf6", // mid mood
  blue:    "#3b82f6", // calm energy
  red:     "#ef4444", // error / exclude / downvote
  redBg:   "#1a0808",
  white:   "#ffffff",
  sub:     "#888888", // secondary text
  muted:   "#555555", // tertiary text
  label:   "#444444", // uppercase micro-labels
  faint:   "#333333", // hairlines / disabled numerals
};

// Fonts. Display = Space Grotesk (loaded in index.html); body = Inter / system.
export const FONT = {
  display: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  body:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// Type scale — editorial: big display numbers + tiny kerned labels.
export const TYPE = {
  hero:    { fontFamily: FONT.display, fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95 },
  title:   { fontFamily: FONT.display, fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.0 },
  section: { fontFamily: FONT.display, fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em" },
  stat:    { fontFamily: FONT.display, fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 },
  body:    { fontFamily: FONT.body, fontSize: "15px", fontWeight: 400, lineHeight: 1.5, color: C.sub },
  micro:   { fontFamily: FONT.body, fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: C.label },
  quote:   { fontFamily: FONT.display, fontSize: "clamp(20px, 3vw, 30px)", fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.25 },
};

// 8px spacing scale.
export const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 };

// Mood → accent color + full-bleed "chapter" tint background.
export const MOOD = {
  dark:    { color: C.indigo, tint: "rgba(99,102,241,0.08)",  label: "dark" },
  neutral: { color: C.amber,  tint: "rgba(245,158,11,0.07)",  label: "neutral" },
  happy:   { color: C.green,  tint: "rgba(29,185,84,0.08)",   label: "happy" },
};

// Map a 0..1 valence to its mood accent color (shared across pages).
export function moodColor(v) {
  if (v == null) return C.label;
  if (v < 0.3) return C.indigo;
  if (v < 0.6) return C.amber;
  return C.green;
}
export function moodKey(v) {
  if (v == null) return "neutral";
  if (v < 0.35) return "dark";
  if (v >= 0.6) return "happy";
  return "neutral";
}

// ---- Style helpers (compatible with the old card()/btn()/pill()/inp()) ----

export const card = (extra = {}) => ({
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: "14px",
  padding: "20px 22px",
  ...extra,
});

export const btn = (variant = "primary", extra = {}) => {
  const base = {
    padding: "10px 18px", borderRadius: "10px", fontSize: "13px",
    fontWeight: 700, fontFamily: FONT.body, cursor: "pointer",
    border: "none", transition: "all 0.15s",
  };
  if (variant === "ghost")
    return { ...base, background: "#151515", color: C.sub, border: `1px solid ${C.border}`, ...extra };
  if (variant === "danger")
    return { ...base, background: C.redBg, color: C.red, border: "1px solid #3a1a1a", ...extra };
  return { ...base, background: C.green, color: "#000", ...extra };
};

export const pill = (active, extra = {}) => ({
  padding: "8px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
  fontFamily: FONT.body, cursor: "pointer", border: "1px solid",
  transition: "all 0.15s", userSelect: "none", minHeight: "40px",
  display: "inline-flex", alignItems: "center",
  background: active ? C.green : "#151515",
  color: active ? "#000" : C.sub,
  borderColor: active ? C.green : C.border,
  ...extra,
});

export const input = (extra = {}) => ({
  background: C.card2, border: `1px solid ${C.border}`, borderRadius: "10px",
  padding: "10px 14px", color: "#fff", fontSize: "13px", fontFamily: FONT.body,
  outline: "none", boxSizing: "border-box", minHeight: "40px", maxWidth: "100%",
  ...extra,
});

// Shared Recharts theming.
export const chartTooltip = {
  background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
  fontSize: "12px", fontFamily: FONT.body, color: "#fff",
};
export const axisTick = { fill: C.muted, fontSize: 11, fontFamily: FONT.body };
