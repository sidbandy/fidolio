import { useState } from "react";
import { C, TYPE, FONT } from "../theme";

// Editorial disclosure ("+ / –") to tuck dense content away by default.
export default function Expander({ label, sublabel, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 2px",
          color: "#fff",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...TYPE.section, fontSize: 16 }}>{label}</span>
          {sublabel && <span style={{ ...TYPE.micro, color: C.muted }}>{sublabel}</span>}
        </span>
        <span style={{ fontFamily: FONT.display, fontSize: 22, color: C.sub, lineHeight: 1, flexShrink: 0 }}>
          {open ? "–" : "+"}
        </span>
      </button>
      {open && <div className="fade-in" style={{ paddingBottom: 18 }}>{children}</div>}
    </div>
  );
}
