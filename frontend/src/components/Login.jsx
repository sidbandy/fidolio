import { C, FONT, TYPE, discoText } from "../theme";
import { useAuth } from "../context/AuthProvider";

const SPOTIFY_GREEN = "#1DB954";

function SpotifyGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0B0C0F" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.586 14.424a.624.624 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.624.624 0 1 1-.277-1.217c3.809-.871 7.077-.496 9.712 1.117a.624.624 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 1 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.328a.78.78 0 0 1 .257 1.074zm.105-2.835C14.692 8.95 9.375 8.775 6.395 9.68a.935.935 0 1 1-.542-1.79c3.42-1.039 9.29-.838 12.962 1.34a.935.935 0 1 1-.954 1.612z" />
    </svg>
  );
}

export default function Login({ error }) {
  const { login } = useAuth();
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.ink, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 22px",
    }}>
      {/* subtle disco-green top glow + chrome floor */}
      <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: 760, height: 560, background: "radial-gradient(closest-side, rgba(29,185,84,0.16), rgba(29,185,84,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(188,194,204,0.05), rgba(0,0,0,0) 38%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 460, textAlign: "center" }}>
        <div style={{ ...TYPE.micro, color: C.silver, letterSpacing: "3px", marginBottom: 18 }}>HIGH FIDELITY</div>

        <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontStyle: "italic", fontSize: "clamp(56px, 13vw, 92px)", letterSpacing: "-0.05em", lineHeight: 0.9, ...discoText }}>
          FIDOLIO
        </div>

        <h1 style={{ fontFamily: FONT.head, fontSize: "clamp(20px, 4.5vw, 28px)", fontWeight: 800, color: C.ink, margin: "26px 0 10px", letterSpacing: "0.01em" }}>
          Your library, decoded.
        </h1>
        <p style={{ ...TYPE.body, fontSize: 14.5, lineHeight: 1.55, color: C.sub, maxWidth: 380, margin: "0 auto 30px" }}>
          Real stats, a taste fingerprint, smart search, and discovery — all built from your own
          Spotify. Log in and we'll analyze your songs the way Spotify won't.
        </p>

        <button onClick={login} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 11,
          background: SPOTIFY_GREEN, color: "#0B0C0F", border: "none", cursor: "pointer",
          fontFamily: FONT.ui, fontWeight: 800, fontSize: 15.5, letterSpacing: "0.02em",
          padding: "15px 30px", borderRadius: 999, boxShadow: "0 8px 26px rgba(29,185,84,0.32)",
          transition: "transform 0.12s cubic-bezier(0.34,1.6,0.5,1), box-shadow 0.15s",
        }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
          <SpotifyGlyph size={21} /> Continue with Spotify
        </button>

        {error && (
          <div style={{ marginTop: 18, fontSize: 12.5, color: C.pink, fontFamily: FONT.mono }}>
            Couldn't sign in ({error}). Please try again.
          </div>
        )}

        <p style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, marginTop: 26, lineHeight: 1.6 }}>
          We only read your saved library + listening history.<br />Nothing is posted on your behalf.
        </p>
      </div>
    </div>
  );
}
