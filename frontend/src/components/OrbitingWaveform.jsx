import { useEffect, useRef } from "react";
import { C, moodColor } from "../theme";

// Circular "orbiting particles" visualizer. Themed via tokens (reskin-ready: only
// the color swaps later). Every song gets a deterministic *signature* from its
// audio features when idle; when it's the active preview it reacts to the real
// audio via a shared Web Audio AnalyserNode.
//
// Perf: idle = ONE static frame (so a 50-row list stays cheap); only the active
// track runs a requestAnimationFrame loop.

// Tiny seeded PRNG so each track's idle signature is distinct but stable.
function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

export default function OrbitingWaveform({
  size = 46, active = false, analyser = null, features = null,
  seed = "x", valence = null, glow = true,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const f = features || {};
    const energy = clamp01(f.energy ?? 0.5);
    const tempo = f.tempo ?? 110;
    const color = valence != null ? moodColor(valence) : C.green;
    const maxR = size * 0.42;
    const small = size < 64;
    const rings = small ? 2 : 3;
    const perRing = small ? 9 : 15;
    const dotR = small ? 1.25 : 1.9;

    const rand = makeRng(seed + "|" + Math.round(energy * 100));
    const parts = [];
    for (let r = 0; r < rings; r++) {
      const baseR = maxR * ((r + 1) / rings) * 0.86;
      for (let k = 0; k < perRing; k++) {
        parts.push({
          baseR, ang: (k / perRing) * Math.PI * 2 + rand() * 0.4,
          phase: rand() * Math.PI * 2, dir: r % 2 ? -1 : 1,
          bin: Math.floor((r * perRing + k) / (rings * perRing) * 0.7 * 64),
        });
      }
    }
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const draw = (tms) => {
      const time = tms * 0.001;
      ctx.clearRect(0, 0, size, size);
      if (active && analyser && freq) analyser.getByteFrequencyData(freq);
      const spin = active ? time * (0.35 + tempo / 320) : time * 0.12;
      for (const p of parts) {
        let amp, bright = 0;
        if (active && freq) {
          const v = (freq[Math.min(p.bin, freq.length - 1)] || 0) / 255;
          amp = v * maxR * 0.55; bright = v;
        } else {
          amp = (0.05 + energy * 0.12) * maxR * (0.55 + 0.45 * Math.sin(time * 1.4 + p.phase));
        }
        const ang = p.ang + p.dir * spin;
        const rr = p.baseR + amp;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        ctx.beginPath();
        ctx.arc(x, y, dotR + bright * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = active ? 0.9 : 0.62;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = active ? 7 : 3; }
        ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (active) rafRef.current = requestAnimationFrame(draw);
    };

    if (active) rafRef.current = requestAnimationFrame(draw);
    else draw(0);   // single static signature frame — no rAF when idle
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, active, analyser, features, seed, valence, glow]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
