import { useState } from "react";
import { C, TYPE, FONT } from "../theme";

// Small "i" button that reveals a plain-language explanation/summary popover.
// Use on stats whose raw numbers are hard to interpret.
export default function InfoTip({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={title ? `What does ${title} mean?` : "More info"}
        style={{
          width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.border2}`,
          background: open ? C.green : "transparent", color: open ? "#000" : C.sub,
          fontSize: 11, fontWeight: 700, fontFamily: FONT.body, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1, flexShrink: 0,
        }}
      >
        i
      </button>
      {open && (
        <>
          {/* click-away catcher */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            className="fade-in"
            style={{
              position: "absolute", top: 24, right: 0, zIndex: 41, width: 270,
              background: "#141414", border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "12px 14px", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", textAlign: "left",
            }}
          >
            {title && <div style={{ ...TYPE.micro, color: C.green, marginBottom: 6 }}>{title}</div>}
            <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>{children}</div>
          </div>
        </>
      )}
    </span>
  );
}
