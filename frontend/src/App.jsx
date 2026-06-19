import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { C } from "./theme";
import useMediaQuery from "./hooks/useMediaQuery";
import Spine, { SIDEBAR, MOBILE_Q } from "./components/Spine";
import NowPlaying from "./components/NowPlaying";

// The five magazine sections
import Identity from "./pages/Identity";
import Collection from "./pages/Collection";
import Discover from "./pages/Discover";
import Chronicle from "./pages/Chronicle";
import Studio from "./pages/Studio";
import CollabPage from "./pages/Collab"; // shared collab-room deep links

function Shell() {
  const isMobile = useMediaQuery(MOBILE_Q);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: "#fff" }}>
      <Spine />
      <main
        style={{
          marginLeft: isMobile ? 0 : SIDEBAR,
          paddingTop: isMobile ? 52 : 0,
          paddingBottom: 96,
          minHeight: "100vh",
        }}
      >
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
      </main>
      <NowPlaying />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
