import { C, FONT, TYPE } from "../theme";

// Magazine "department" divider: number + title + chunky ink rule + optional controls.
export default function Department({ no, title, right, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        margin: "0 0 22px",
        flexWrap: "wrap",
        ...style,
      }}
    >
      {no && (
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: C.accent, letterSpacing: "0.08em" }}>
          {no}
        </span>
      )}
      <h2 style={{ ...TYPE.section, margin: 0, whiteSpace: "nowrap" }}>{title}</h2>
      <div style={{ flex: 1, height: 4, background: C.accent, minWidth: 24, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)" }} />
      {right}
    </div>
  );
}
