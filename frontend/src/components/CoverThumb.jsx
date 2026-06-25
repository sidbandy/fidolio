import { useState, useRef, useEffect } from "react";
import CoverButton from "../ui/CoverButton";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Module-level cover cache (shared across every row) so the same album is fetched once.
const coverCache = new Map(); // "album|||artist" -> url | null

// Album cover that doubles as the play/pause control. Lazy-fetches the cover from
// Deezer (only once it scrolls near the viewport) and renders a CoverButton.
export default function CoverThumb({ album, artist, size = 42, playing, onClick }) {
  const key = `${album || ""}|||${artist || ""}`;
  const [art, setArt] = useState(() => (coverCache.has(key) ? coverCache.get(key) : null));
  const wrapRef = useRef(null);

  useEffect(() => {
    if (coverCache.has(key)) { setArt(coverCache.get(key)); return; }
    if (!album) return;
    let alive = true;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      fetch(`${API}/library/album-cover?album=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist || "")}`)
        .then((r) => r.json())
        .then((d) => { const u = d.cover || null; coverCache.set(key, u); if (alive) setArt(u); })
        .catch(() => { coverCache.set(key, null); });
    }, { rootMargin: "250px" });
    if (wrapRef.current) io.observe(wrapRef.current);
    return () => { alive = false; io.disconnect(); };
  }, [key, album, artist]);

  return (
    <div ref={wrapRef} style={{ width: size, height: size, flexShrink: 0 }}>
      <CoverButton art={art} state={playing ? "playing" : "idle"} onClick={onClick} size={size} radius="50%" iconScale={0.46} />
    </div>
  );
}
