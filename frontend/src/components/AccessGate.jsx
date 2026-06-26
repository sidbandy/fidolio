import { useState } from "react";
import { C, FONT, TYPE, input, discoText } from "../theme";
import { useAuth } from "../context/AuthProvider";

// The intermediary "private access" page, shown before Spotify. Rendered as a full-screen
// overlay so it works from the landing page AND from inside the demo (banner / sidebar).
// The code is checked client-side on purpose: it only spares random visitors a raw Spotify
// error — the real gate is Spotify's allow-list, which a code can't bypass.
const ACCESS_CODE = "butterchicken";

export default function AccessGate() {
  const { accessGateOpen, closeAccessGate, login } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  if (!accessGateOpen) return null;

  const submit = () => {
    if (code.trim().toLowerCase() === ACCESS_CODE) {
      login(); // correct → forward to Spotify consent
    } else {
      setError(true);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 2000, background: C.bg, color: C.ink,
      overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 22px",
    }}>
      {/* same disco-green glow + chrome floor as the landing, so the gate feels native */}
      <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: 760, height: 560, background: "radial-gradient(closest-side, rgba(29,185,84,0.16), rgba(29,185,84,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(188,194,204,0.05), rgba(0,0,0,0) 38%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 460, textAlign: "center" }}>
        <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontStyle: "italic", fontSize: "clamp(34px, 8vw, 48px)", letterSpacing: "-0.05em", lineHeight: 0.9, ...discoText }}>
          FIDOLIO
        </div>
        <div style={{ ...TYPE.micro, color: C.silver, letterSpacing: "3px", margin: "16px 0 14px" }}>PRIVATE ACCESS</div>

        <h1 style={{ fontFamily: FONT.head, fontSize: "clamp(20px, 4.5vw, 27px)", fontWeight: 800, color: C.ink, margin: "0 0 12px", letterSpacing: "0.01em" }}>
          Personal access is invite-only
        </h1>
        <p style={{ ...TYPE.body, fontSize: 14, lineHeight: 1.6, color: C.sub, maxWidth: 420, margin: "0 auto 10px" }}>
          The full Fidolio links directly to <b style={{ color: C.ink }}>your</b> Spotify account
          to build a private profile from your real listening. Spotify only permits an app to do
          that for a small set of individually-approved accounts — broad access is reserved for
          registered companies with hundreds of thousands of users.
        </p>
        <p style={{ ...TYPE.body, fontSize: 14, lineHeight: 1.6, color: C.sub, maxWidth: 420, margin: "0 auto 24px" }}>
          So as a personal project, sign-in is by invitation. Have a code? Enter it below.
          Otherwise, the entire app is open to explore as a live demo built from real data.
        </p>

        <div style={{ display: "flex", gap: 9, justifyContent: "center", maxWidth: 380, margin: "0 auto" }}>
          <input
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value); if (error) setError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Access code"
            aria-label="Access code"
            style={input({ flex: 1, textAlign: "center", letterSpacing: "0.08em",
              borderColor: error ? C.red : C.border2, minHeight: 46, fontSize: 14.5 })}
          />
          <button onClick={submit} style={{
            background: "#1DB954", color: "#0B0C0F", border: "none", cursor: "pointer",
            fontFamily: FONT.ui, fontWeight: 800, fontSize: 14, letterSpacing: "0.02em",
            padding: "0 22px", borderRadius: 5, minHeight: 46, whiteSpace: "nowrap",
          }}>Continue</button>
        </div>

        <div style={{ minHeight: 20, marginTop: 12 }}>
          {error && (
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.red }}>
              That code isn't right. Check with whoever invited you.
            </span>
          )}
        </div>

        <button onClick={() => { setCode(""); setError(false); closeAccessGate(); }} style={{
          background: "none", border: "none", color: C.muted, cursor: "pointer",
          fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: "0.04em", marginTop: 18,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>
          ← Back to the live demo
        </button>
      </div>
    </div>
  );
}
