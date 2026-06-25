import { useEffect, useRef, useState } from "react";
import { C, FONT } from "../theme";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Module-level cache so the same artist photo is fetched once across all mounts
// (the Top-100 list + podium + discovery studio all reuse this).
const _cache = new Map(); // name(lower) -> url | null

// Batched, paced image loader (DataLoader pattern). As you scroll the Top-100 board, tiles
// request photos; instead of firing ~100 calls at once (which trips Deezer's rate limit and
// leaves whole chunks blank), we collect requests, send them in small chunks ONE at a time, and
// let the server resolve each chunk with a worker pool. Result: photos fill in reliably, paced.
const _waiting = new Map();   // key(lower) -> { name, resolvers: [fn] }
let _scheduled = false, _inflight = false;
const CHUNK = 24;

function _schedule() {
  if (_scheduled || _inflight) return;
  _scheduled = true;
  setTimeout(_run, 40);
}
async function _run() {
  _scheduled = false;
  if (_inflight || _waiting.size === 0) return;
  _inflight = true;
  const batch = [..._waiting.values()].slice(0, CHUNK);
  const names = batch.map((e) => e.name);
  try {
    const r = await fetch(`${API}/library/artist-images?names=${encodeURIComponent(names.join("|"))}`);
    const map = (await r.json()).images || {};
    for (const e of batch) {
      const key = e.name.trim().toLowerCase();
      const img = map[key] ?? null;
      if (img) _cache.set(key, img);   // cache hits; let misses retry on a later scroll
      e.resolvers.forEach((res) => res(img));
      _waiting.delete(key);
    }
  } catch {
    for (const e of batch) { e.resolvers.forEach((res) => res(null)); _waiting.delete(e.name.trim().toLowerCase()); }
  } finally {
    _inflight = false;
    if (_waiting.size) _schedule();    // next chunk, sequentially
  }
}
function loadArtistImage(name) {
  const key = (name || "").trim().toLowerCase();
  if (_cache.has(key)) return Promise.resolve(_cache.get(key));
  return new Promise((resolve) => {
    const e = _waiting.get(key) || { name, resolvers: [] };
    e.resolvers.push(resolve);
    _waiting.set(key, e);
    _schedule();
  });
}

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
    loadArtistImage(name).then((img) => { if (alive) setSrc(img); });
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
