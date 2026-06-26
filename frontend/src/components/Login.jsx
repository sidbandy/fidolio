import { C, FONT, TYPE, discoText } from "../theme";

// Landing page. One clear action — explore the live demo. Friends log in from the sidebar once inside.
export default function Login({ onDemo, owner }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.ink, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 22px",
    }}>
      {/* subtle disco-green top glow + chrome floor */}
      <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: 760, height: 560, background: "radial-gradient(closest-side, rgba(29,185,84,0.16), rgba(29,185,84,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(188,194,204,0.05), rgba(0,0,0,0) 38%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 480, textAlign: "center" }}>
        <div style={{ ...TYPE.micro, color: C.silver, letterSpacing: "3px", marginBottom: 18 }}>HIGH FIDELITY</div>

        <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontStyle: "italic", fontSize: "clamp(56px, 13vw, 92px)", letterSpacing: "-0.05em", lineHeight: 0.9, ...discoText }}>
          FIDOLIO
        </div>

        <h1 style={{ fontFamily: FONT.head, fontSize: "clamp(20px, 4.5vw, 28px)", fontWeight: 800, color: C.ink, margin: "26px 0 10px", letterSpacing: "0.01em" }}>
          Your library, decoded.
        </h1>
        <p style={{ ...TYPE.body, fontSize: 14.5, lineHeight: 1.55, color: C.sub, maxWidth: 400, margin: "0 auto 30px" }}>
          A live demo built from real Spotify data — your taste fingerprint, real stats, smart search,
          and discovery. Take a look around{owner ? `, on ${owner}'s library` : ""}.
        </p>

        <button onClick={onDemo} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
          background: "#1DB954", color: "#0B0C0F", border: "none", cursor: "pointer",
          fontFamily: FONT.ui, fontWeight: 800, fontSize: 16, letterSpacing: "0.02em",
          padding: "16px 34px", borderRadius: 999, boxShadow: "0 8px 26px rgba(29,185,84,0.32)",
          transition: "transform 0.12s cubic-bezier(0.34,1.6,0.5,1)",
        }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
          See live demo →
        </button>

        <p style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, marginTop: 24, lineHeight: 1.6 }}>
          Friends: explore the demo, then <b style={{ color: C.silver }}>Log in with Spotify</b> from the sidebar to see your own.
        </p>
      </div>
    </div>
  );
}
