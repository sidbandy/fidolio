import { useEffect } from "react";
import { C, FONT, TYPE, discoText } from "../theme";
import { useAuth } from "../context/AuthProvider";

// Shown to a brand-new user while their library is first pulled in. Polls /auth/me; the App gate
// lets them through the moment the backend has their tracks (status advances past "syncing").
export default function SyncGate() {
  const { user, refresh, logout } = useAuth();
  useEffect(() => {
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const saved = user?.saved_count || 0;
  const failed = user?.sync_status === "error";

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.ink, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 22px",
    }}>
      <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: 720, height: 520, background: "radial-gradient(closest-side, rgba(29,185,84,0.14), rgba(29,185,84,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontStyle: "italic", fontSize: "clamp(40px, 9vw, 60px)", letterSpacing: "-0.05em", lineHeight: 0.9, marginBottom: 26, ...discoText }}>
          FIDOLIO
        </div>

        {failed ? (
          <>
            <h1 style={{ fontFamily: FONT.head, fontSize: 24, fontWeight: 800, margin: "0 0 10px" }}>Hmm, that didn't finish.</h1>
            <p style={{ ...TYPE.body, fontSize: 14, color: C.sub, marginBottom: 24 }}>{user?.sync_detail || "We hit a snag building your library."}</p>
            <button onClick={() => refresh()} style={{ background: C.silver, color: C.bg, border: "none", borderRadius: 999, padding: "12px 26px", fontWeight: 700, fontFamily: FONT.ui, cursor: "pointer" }}>Retry</button>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: FONT.head, fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: "0.01em" }}>
              Building your library{user?.display_name ? `, ${user.display_name.split(" ")[0]}` : ""}…
            </h1>
            <p style={{ ...TYPE.body, fontSize: 14, lineHeight: 1.55, color: C.sub, maxWidth: 360, margin: "0 auto 24px" }}>
              We're pulling in your saved songs and analyzing each one — energy, mood, key, language.
              Big libraries take a minute. You'll drop right in when it's ready.
            </p>

            {/* indeterminate progress strip */}
            <div style={{ height: 5, width: "100%", maxWidth: 300, margin: "0 auto", background: C.card, borderRadius: 999, overflow: "hidden", border: `1px solid ${C.border2}` }}>
              <div className="loading-strip" style={{ height: "100%", width: "40%", background: "#1DB954", borderRadius: 999 }} />
            </div>

            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, marginTop: 16 }}>
              {saved > 0 ? `${saved.toLocaleString()} songs analyzed so far` : (user?.sync_detail || "Reading your saved tracks…")}
            </div>
          </>
        )}

        <button onClick={logout} style={{ marginTop: 30, background: "none", border: "none", color: C.muted, fontFamily: FONT.mono, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
          Not you? Log out
        </button>
      </div>
    </div>
  );
}
