import { useEffect, useRef, useState } from "react";
import { C, FONT } from "../theme";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Module-level cache so the same artist photo is fetched once across all mounts
// (the Top-100 list + podium + discovery studio all reuse this).
const _cache = new Map(); // name(lower) -> url | null

// Lazy artist photo (Deezer via /library/artist-image). Only fetches when it
// scrolls into view, so a 100-row list doesn't fire 100 requests at once.
// Falls back to a tinted initial when no photo exists.
export default function ArtistAvatar({ name, size = 44, radius = "50%", eager = false, ring, fill = false }) {
  const key = (name || "").trim().toLowerCase();
  const [src, setSrc] = useState(() => _cache.get(key) ?? null);
  const [seen, setSeen] = useState(eager || _cache.has(key));
  const ref = useRef(null);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setSeen(true); io.disconnect(); } },
      { rootMargin: "250px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || !key) return;
    if (_cache.has(key)) { setSrc(_cache.get(key)); return; }
    let alive = true;
    fetch(`${API}/library/artist-image?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => { _cache.set(key, d.image || null); if (alive) setSrc(d.image || null); })
      .catch(() => { _cache.set(key, null); });
    return () => { alive = false; };
  }, [seen, key, name]);

  const initial = ((name || "?").trim()[0] || "?").toUpperCase();
  return (
    <div
      ref={ref}
      style={{
        width: fill ? "100%" : size, height: fill ? "100%" : size,
        borderRadius: radius, flexShrink: 0,
        background: C.card2, overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center",
        border: ring || (fill ? "none" : `1px solid ${C.border}`),
      }}
    >
      {src ? (
        <img src={src} alt={name} loading="lazy"
             style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{ fontFamily: FONT.display, fontWeight: 700, color: C.muted, fontSize: fill ? 30 : Math.round(size * 0.38) }}>
          {initial}
        </span>
      )}
    </div>
  );
}
