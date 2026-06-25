// Fidolio design system — single source of truth.
// Identity: "Y2K Chrome Press" — a Y2K teen-magazine energy rendered dark + metallic.
// Deep volcanic-graphite base (textured, not flat), BOLD jewel color BLOCKS per
// department, chrome-filled headlines with thick black magazine outlines, gunmetal
// silver woven throughout, and a script accent for flair.
// Type: Clash Display (display) · Space Grotesk (UI/body) · Space Mono (data) ·
//       Yellowtail (script accents).

export const C = {
  bg:      "#0B0C0F", // near-black volcanic rock (rough texture in CSS)
  card:    "#181B22", // lifted panel surface
  card2:   "#0E1014", // recessed input / secondary surface
  border:  "rgba(233,238,247,0.09)", // hairline
  border2: "rgba(233,238,247,0.18)", // stronger hairline
  line:    "rgba(233,238,247,0.10)", // panel edge
  ink:     "#F2F4F8", // PRIMARY TEXT (cool off-white)
  green:   "#D9A441", // "happy" mood = warm gold
  greenBg: "rgba(217,164,65,0.16)",
  greenBd: "#D9A441",
  amber:   "#9AA0AA", // "neutral" mood = silver-grey
  amberBg: "rgba(154,160,170,0.13)",
  indigo:  "#5E6B82", // "dark" mood = steel blue
  violet:  "#8A7BB0", // mid
  blue:    "#6E84A8", // calm energy — steel blue
  red:     "#E0533A", // error / exclude — warm burnt
  redBg:   "rgba(224,83,58,0.15)",
  white:   "#FFFFFF",
  sub:     "#A6ABB5", // secondary text (cool grey)
  muted:   "#71757E", // tertiary text
  label:   "#8A8F99", // uppercase micro-labels
  faint:   "#383C45", // hairlines / disabled numerals
  // gunmetal + supporting ramp (chrome accents + chart series)
  silver:  "#BCC2CC", // gunmetal silver / chrome base
  steel:   "#8B92A0", // darker gunmetal
  teal:    "#6FB7C2", // steel-cyan
  denim:   "#6E84A8", // steel blue
  brown:   "#B08A5A", // bronze
  pink:    "#C26E94", // dusty rose
  ink2:    "#14161B", // true-dark — text ON light/color blocks
  accent:     "var(--accent, #BCC2CC)",       // per-page accent (each page root sets --accent; frame falls back to silver)
  accentInk:  "var(--accent-ink, #14161B)",   // text ON the accent
  accentWash: "var(--accent-wash, rgba(188,194,204,0.16))",
};

// Accent tint — mixes the per-page --accent into a base color (color-mix; silver fallback).
// Lets shared primitives (cards, borders, page glow) all carry each section's color.
export const tint = (pct, base = "transparent") =>
  `color-mix(in srgb, var(--accent, ${C.silver}) ${pct}%, ${base})`;

// Page background — a colored glow of the section accent over the volcanic base
// (replaces the flat near-black so every page is bathed in its own color).
export const PAGE_BG = `radial-gradient(120% 70% at 50% -10%, ${tint(20)} 0%, transparent 46%), ${C.bg}`;

// Brushed-metal graphite panel + sheen — the "box" treatment.
export const PANEL = "linear-gradient(160deg, #22262F 0%, #15181E 55%, #1B1F27 100%)";
export const SHEEN = "inset 0 1px 0 rgba(245,248,255,0.09)";
export const STEEL = "linear-gradient(165deg, #2A2E38 0%, #181B22 60%, #22262F 100%)";

// Each department owns a BOLD jewel color BLOCK (used as fills, not edges) — bright + striking.
export const SECTION = {
  1: { color: "#1E6BFF", wash: "rgba(30,107,255,0.22)",  on: "#FFFFFF", name: "Identity"   }, // electric lightning-storm blue
  2: { color: "#FF2E9C", wash: "rgba(255,46,156,0.24)",  on: "#FFFFFF", name: "Collection" }, // bright jewel pink
  3: { color: "#1AD46B", wash: "rgba(26,212,107,0.24)",  on: "#05210F", name: "Discover"   }, // vivid emerald
  4: { color: "#D6122E", wash: "rgba(214,18,46,0.26)",   on: "#FFFFFF", name: "Rewind"     }, // deep metallic blood red
  5: { color: "#8E3BFF", wash: "rgba(142,59,255,0.24)",  on: "#FFFFFF", name: "Playlists"  }, // electric violet
};

export const FONT = {
  display: "'Clash Display', 'Archivo', 'Space Grotesk', sans-serif", // chic Y2K-magazine display
  blok:    "'Blok', 'Clash Display', 'Archivo', sans-serif", // chunky display
  head:    "'Meloriac', 'Clash Display', sans-serif", // page header titles
  tab:     "'Mexcellent', 'Clash Display', sans-serif", // sidebar tab names
  fat:     "'Syne', 'Space Grotesk', sans-serif", // big single words (chart labels)
  lede:    "'Syne', 'Space Grotesk', sans-serif", // descriptions / ledes
  serif:   "'Fraunces', Georgia, 'Times New Roman', serif", // editorial serif — song/artist/album labels
  logo:    "'Monoton', sans-serif",               // disco-ball wordmark
  ui:      "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  body:    "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:    "'Space Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  script:  "'Yellowtail', cursive", // Y2K-magazine script accent
};

export const TYPE = {
  hero:    { fontFamily: FONT.display, fontSize: "clamp(42px, 7.5vw, 82px)", fontWeight: 800, fontStretch: "125%", letterSpacing: "-0.01em", lineHeight: 1.02, color: C.ink },
  title:   { fontFamily: FONT.display, fontSize: "clamp(26px, 4.2vw, 44px)", fontWeight: 700, fontStretch: "125%", letterSpacing: "-0.005em", lineHeight: 1.05, color: C.ink },
  section: { fontFamily: FONT.display, fontSize: "21px", fontWeight: 700, fontStretch: "125%", letterSpacing: "0", color: C.ink },
  stat:    { fontFamily: FONT.display, fontSize: "clamp(26px, 3.2vw, 44px)", fontWeight: 800, fontStretch: "125%", letterSpacing: "0", lineHeight: 1.0, color: C.ink },
  body:    { fontFamily: FONT.body, fontSize: "15px", fontWeight: 400, lineHeight: 1.55, color: C.sub },
  micro:   { fontFamily: FONT.mono, fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: C.label },
  quote:   { fontFamily: FONT.script, fontSize: "clamp(26px, 3.6vw, 40px)", fontWeight: 400, lineHeight: 1.1, color: C.ink },
};

export const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 };

export const MOOD = {
  dark:    { color: C.indigo, tint: "rgba(94,107,130,0.14)",  label: "dark" },
  neutral: { color: C.amber,  tint: "rgba(154,160,170,0.12)", label: "neutral" },
  happy:   { color: C.green,  tint: "rgba(217,164,65,0.14)",  label: "happy" },
};

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

// ---- Style helpers ----

export const card = (extra = {}) => ({
  background: PANEL,
  border: `1px solid ${C.line}`,
  borderRadius: "6px",
  boxShadow: SHEEN,
  padding: "20px 22px",
  ...extra,
});

export const btn = (variant = "primary", extra = {}) => {
  const base = {
    padding: "11px 18px", borderRadius: "5px", fontSize: "12.5px",
    fontWeight: 700, fontFamily: FONT.ui, textTransform: "uppercase",
    letterSpacing: "0.04em", cursor: "pointer", border: `1px solid ${C.border2}`,
    transition: "transform 0.12s cubic-bezier(0.34,1.6,0.5,1), filter 0.15s, background 0.15s",
    display: "inline-flex", alignItems: "center", gap: "8px", lineHeight: 1,
  };
  if (variant === "ghost")
    return { ...base, background: "transparent", color: C.ink, ...extra };
  if (variant === "danger")
    return { ...base, background: C.redBg, color: C.red, border: `1px solid ${C.red}`, ...extra };
  return { ...base, background: C.accent, color: C.accentInk, border: "none", boxShadow: SHEEN, ...extra };
};

export const pill = (active, extra = {}) => ({
  padding: "7px 13px", borderRadius: "4px", fontSize: "12px", fontWeight: 600,
  fontFamily: FONT.ui, cursor: "pointer", border: "1px solid",
  transition: "transform 0.12s cubic-bezier(0.34,1.6,0.5,1), background 0.15s",
  userSelect: "none", minHeight: "36px", display: "inline-flex", alignItems: "center",
  background: active ? C.accent : "transparent",
  color: active ? C.accentInk : C.ink,
  borderColor: active ? C.accent : C.border2,
  ...extra,
});

export const input = (extra = {}) => ({
  background: C.card2, border: `1px solid ${C.border2}`, borderRadius: "5px",
  padding: "10px 13px", color: C.ink, fontSize: "13px", fontFamily: FONT.ui,
  outline: "none", boxSizing: "border-box", minHeight: "40px", maxWidth: "100%",
  ...extra,
});

// ── Layout constants ──
export const SIDEBAR = 248;
export const MOBILE_Q = "(max-width: 860px)";

export const chartTooltip = {
  background: "#1E2128", border: `1px solid ${C.border2}`, borderRadius: "5px",
  fontSize: "12px", fontFamily: FONT.mono, color: C.ink,
};
export const axisTick = { fill: C.muted, fontSize: 11, fontFamily: FONT.mono };

// Shiny gunmetal chrome — for the wordmark + select accents.
export const CHROME = "linear-gradient(180deg,#FFFFFF 0%,#DCE0E8 14%,#9AA0AC 35%,#FBFCFE 52%,#AEB4C0 66%,#767C88 86%,#D2D6DE 100%)";
export const chromeText = {
  backgroundImage: CHROME,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))",
};

// Green disco-ball shimmer — for the FIDOLIO wordmark (faceted, metallic, Spotify-green).
export const DISCO = "repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 1.5px, rgba(255,255,255,0) 1.5px 7px), repeating-linear-gradient(-45deg, rgba(3,38,15,0.5) 0 1.5px, rgba(0,0,0,0) 1.5px 7px), linear-gradient(160deg, #dcffe4 0%, #2ee86a 24%, #0f8a3c 48%, #79ffab 62%, #0b6a2f 80%, #38f27d 100%)";
export const discoText = {
  backgroundImage: DISCO,
  backgroundSize: "7px 7px, 7px 7px, 100% 240%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.7)) drop-shadow(0 0 8px rgba(29,185,84,0.5))",
};

// Shiny jewelry gold — for Play Next / In Library (anywhere that was yellow/ombre).
export const GOLD = "linear-gradient(135deg,#FCEFB4 0%,#E9C158 20%,#C9962E 44%,#F7E08C 60%,#A87A1E 82%,#EBCB66 100%)";
export const goldJewel = (extra = {}) => ({
  background: GOLD,
  color: "#2A1E04",
  border: "1px solid rgba(122,90,18,0.9)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(120,80,10,0.4), 0 3px 10px rgba(0,0,0,0.45)",
  textShadow: "0 1px 0 rgba(255,255,255,0.35)",
  ...extra,
});

// Big magazine headline — chrome fill + thick black outline (the Teen-People look).
export const metalHeadline = {
  backgroundImage: CHROME,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  WebkitTextStroke: "2px #0A0B0D",
  paintOrder: "stroke fill",
  color: "transparent",
  filter: "drop-shadow(0 3px 0 rgba(0,0,0,0.45))",
};
