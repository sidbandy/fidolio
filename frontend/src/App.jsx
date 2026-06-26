import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { C, FONT, discoText } from "./theme";
import useMediaQuery from "./hooks/useMediaQuery";
import Spine, { SIDEBAR, MOBILE_Q } from "./components/Spine";
import ErrorBoundary from "./components/ErrorBoundary";
import { PreviewProvider } from "./context/PreviewProvider";
import { AuthProvider, useAuth } from "./context/AuthProvider";
import Login from "./components/Login";
import SyncGate from "./components/SyncGate";

// The five magazine sections
import Identity from "./pages/Identity";
import Collection from "./pages/Collection";
import Discover from "./pages/Discover";
import Chronicle from "./pages/Chronicle";
import Studio from "./pages/Studio";
import CollabPage from "./pages/Collab"; // shared collab-room deep links

function Shell() {
  const isMobile = useMediaQuery(MOBILE_Q);
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("fidolio_spine_collapsed") === "1");
  const toggle = () =>
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("fidolio_spine_collapsed", n ? "1" : "0");
      return n;
    });
  const marginLeft = isMobile ? 0 : collapsed ? 0 : SIDEBAR;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <Spine collapsed={collapsed} onToggle={toggle} />
      <main
        style={{
          marginLeft,
          paddingTop: isMobile ? 52 : 0,
          paddingBottom: isMobile ? 92 : 40,
          minHeight: "100vh",
          transition: "margin-left 0.3s ease",
        }}
      >
        <ErrorBoundary key={pathname}>
        <Routes>
          {/* Sections */}
          <Route path="/" element={<Identity />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/timeline" element={<Chronicle />} />
          <Route path="/playlists" element={<Studio />} />
          <Route path="/collab/:roomId" element={<CollabPage />} />

          {/* Legacy paths → new sections */}
          <Route path="/wrapped" element={<Navigate to="/" replace />} />
          <Route path="/library" element={<Navigate to="/collection" replace />} />
          <Route path="/songs" element={<Navigate to="/collection" replace />} />
          <Route path="/search" element={<Navigate to="/discover" replace />} />
          <Route path="/discovery" element={<Navigate to="/discover" replace />} />
          <Route path="/albums" element={<Navigate to="/discover" replace />} />
          <Route path="/rewind" element={<Navigate to="/timeline" replace />} />
          <Route path="/capsule" element={<Navigate to="/timeline" replace />} />
          <Route path="/collab" element={<Navigate to="/playlists" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function Splash() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="disco-shimmer" style={{ fontFamily: FONT.logo, fontStyle: "italic", fontSize: 48, letterSpacing: "-0.05em", ...discoText }}>FIDOLIO</div>
    </div>
  );
}

// Auth gate: anon → Login; brand-new user with no tracks yet → SyncGate; otherwise the app.
function Gate() {
  const { status, user } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "anon") {
    const err = new URLSearchParams(window.location.search).get("auth_error");
    return <Login error={err} />;
  }
  const hasData = user?.sync_status === "ready" || (user?.saved_count || 0) > 0;
  if (!hasData) return <SyncGate />;
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <PreviewProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </PreviewProvider>
    </AuthProvider>
  );
}
