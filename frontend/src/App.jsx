import { BrowserRouter, Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Dashboard from "./pages/Dashboard";
import Wrapped from "./pages/Wrapped";
import Library from "./pages/Library";
import Search from "./pages/Search";
import Collab from "./pages/Collab";
import Login from "./pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
        <Nav />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wrapped" element={<Wrapped />} />
          <Route path="/library" element={<Library />} />
          <Route path="/search" element={<Search />} />
          <Route path="/collab/:roomId" element={<Collab />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
