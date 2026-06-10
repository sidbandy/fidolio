import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import SonicIdentity from "./pages/SonicIdentity";
import Wrapped from "./pages/Wrapped";
import Library from "./pages/Library";
import Search from "./pages/Search";
import Discovery from "./pages/Discovery";
import Albums from "./pages/Albums";
import NowPlaying from "./components/NowPlaying";

const NAV_LINKS = [
  { to: "/",          label: "Sonic Identity" },
  { to: "/wrapped",   label: "Wrapped" },
  { to: "/library",   label: "Library" },
  { to: "/search",    label: "Search" },
  { to: "/discovery", label: "Discovery" },
  { to: "/albums",    label: "Albums" },
];

function Nav() {
  const { pathname } = useLocation();
  return (
    <nav style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: "0 40px", height: "60px",
      borderBottom: "1px solid #141414",
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)"
    }}>
      <span style={{ fontSize: "18px", fontWeight: 800, color: "#1db954",
        marginRight: "24px", letterSpacing: "-0.5px" }}>
        fidolio
      </span>
      {NAV_LINKS.map(l => (
        <Link key={l.to} to={l.to} style={{
          fontSize: "13px", fontWeight: 500,
          color: pathname === l.to ? "#fff" : "#555",
          textDecoration: "none", padding: "6px 14px", borderRadius: "8px",
          background: pathname === l.to ? "#1a1a1a" : "transparent",
          transition: "all 0.15s"
        }}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "#080808", color: "#fff",
        paddingBottom: "80px" }}>
        <Nav />
        <Routes>
          <Route path="/"          element={<SonicIdentity />} />
          <Route path="/wrapped"   element={<Wrapped />} />
          <Route path="/library"   element={<Library />} />
          <Route path="/search"    element={<Search />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/albums"    element={<Albums />} />
        </Routes>
        <NowPlaying />
      </div>
    </BrowserRouter>
  );
}