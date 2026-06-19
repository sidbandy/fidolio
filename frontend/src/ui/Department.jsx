import { C, FONT, TYPE } from "../theme";

// Magazine "department" divider: number + title + hairline rule + optional controls.
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
        <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: C.green, letterSpacing: "0.08em" }}>
          {no}
        </span>
      )}
      <h2 style={{ ...TYPE.section, color: "#fff", margin: 0, whiteSpace: "nowrap" }}>{title}</h2>
      <div style={{ flex: 1, height: 1, background: C.border, minWidth: 24 }} />
      {right}
    </div>
  );
}
